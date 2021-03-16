require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { JurinetOracle } = require('./jurinet-oracle')
const { JurinetUtils } = require('./jurinet-utils')
const { JuricaOracle } = require('./jurica-oracle')
const { JuricaUtils } = require('./jurica-utils')
const { MongoClient } = require('mongodb')
const crypto = require('crypto')
const needle = require('needle')
const batchSize = 500
const roundSize = 10000
const maxOffset = 900000
const decisionsVersion = parseFloat(process.env.MONGO_DECISIONS_VERSION)

console.log('Setup...')

/* INIT JURINET */
const jurinetOrder = 'DESC'

const jurinetSource = new JurinetOracle({
  verbose: true
})

const jurinetHashes = {}
try {
  let lines = fs.readFileSync(path.join(__dirname, 'hashes.history')).toString().split('\n')
  lines.forEach((line) => {
    if (line) {
      let [id, hash] = line.split(':')
      jurinetHashes[id] = hash
    }
  })
} catch (ignore) { }

let jurinetOffset = 0
try {
  jurinetOffset = parseInt(fs.readFileSync(path.join(__dirname, 'offset.history')).toString(), 10)
} catch (ignore) {
  jurinetOffset = 0
}

let jurinetEmptyRoundCount = 0
try {
  jurinetEmptyRoundCount = parseInt(fs.readFileSync(path.join(__dirname, 'emptyround.history')).toString(), 10)
} catch (ignore) {
  jurinetEmptyRoundCount = 0
}
if (jurinetEmptyRoundCount > roundSize || jurinetOffset > maxOffset) {
  console.log('Jurinet - Reset loop.')
  jurinetOffset = 0
  jurinetEmptyRoundCount = 0
}

/* INIT JURICA */
const juricaOrder = 'DESC'

const juricaSource = new JuricaOracle({
  verbose: true
})

const juricaHashes = {}
try {
  let lines = fs.readFileSync(path.join(__dirname, 'hashes_jurica.history')).toString().split('\n')
  lines.forEach((line) => {
    if (line) {
      let [id, hash] = line.split(':')
      juricaHashes[id] = hash
    }
  })
} catch (ignore) { }


let juricaOffset = 0
try {
  juricaOffset = parseInt(fs.readFileSync(path.join(__dirname, 'offset_jurica.history')).toString(), 10)
} catch (ignore) {
  juricaOffset = 0
}

let juricaEmptyRoundCount = 0
try {
  juricaEmptyRoundCount = parseInt(fs.readFileSync(path.join(__dirname, 'emptyround_jurica.history')).toString(), 10)
} catch (ignore) {
  juricaEmptyRoundCount = 0
}

if (juricaEmptyRoundCount > roundSize || juricaOffset > maxOffset) {
  console.log('Jurica - Reset loop.')
  juricaOffset = 0
  juricaEmptyRoundCount = 0
}

function parseError(e) {
  if (e) {
    let error = {}

    try {
      Object.getOwnPropertyNames(e).forEach(function (key) {
        error[key] = e[key]
      })
    } catch (ignore) { }

    return error
  } else {
    return 'unknown'
  }
}

/* MAIN LOOP */
async function main() {

  // PROCESS JURINET
  await jurinetSource.connect()
  const jurinetResult = await jurinetSource.getBatch({
    offset: jurinetOffset,
    limit: batchSize,
    all: true,
    titrage: true,
    order: jurinetOrder
  })
  await jurinetSource.close()

  if (jurinetResult) {
    if (jurinetOrder === 'DESC') {
      jurinetResult.sort((a, b) => {
        if (a[process.env.MONGO_ID] < b[process.env.MONGO_ID]) {
          return -1
        }
        if (a[process.env.MONGO_ID] > b[process.env.MONGO_ID]) {
          return 1
        }
        return 0
      })
    }
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true
    })
    await client.connect()
    const database = client.db(process.env.MONGO_DBNAME)
    const collection = database.collection(process.env.MONGO_JURINET_COLLECTION)
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION)
    let newCount = 0
    let updateCount = 0
    let normalizeCount = 0
    let errorCount = 0
    let oldOffset = jurinetOffset
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i]
      let updated = false
      const hash = crypto.createHash('md5').update(JSON.stringify(row)).digest('hex')
      if (jurinetHashes[row[process.env.MONGO_ID]] === undefined) {
        try {
          await collection.insertOne(row, { bypassDocumentValidation: true })
          jurinetHashes[row[process.env.MONGO_ID]] = hash
          newCount++
        } catch (e) {
          console.error(e)
          errorCount++
        }
      } else if (jurinetHashes[row[process.env.MONGO_ID]] !== hash) {
        try {
          await collection.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true })
          jurinetHashes[row[process.env.MONGO_ID]] = hash
          updated = true
          updateCount++
        } catch (e) {
          console.error(e)
          errorCount++
        }
      }

      if (row['AUT_CREATION'] !== 'WINCI' && row['TYPE_ARRET'] === 'CC') {
        try {
          let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurinet' })
          if (normalized === null) {
            let normDec = JurinetUtils.Normalize(row)
            if (normDec.pseudoText) {
              try {
                normDec.zoning = await getZones(normDec.sourceId, normDec.sourceName, normDec.pseudoText)
                if (!normDec.zoning || (normDec.zoning && normDec.zoning.detail)) {
                  fs.appendFileSync(path.join(__dirname, 'zoningerror_jurinet.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(normDec.zoning) }) + '\n')
                  console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(normDec.zoning))
                }
              } catch (e) {
                fs.appendFileSync(path.join(__dirname, 'zoningerror_jurinet.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(e) }) + '\n')
                console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(e))
                normDec.zoning = undefined
              }
            } else {
              normDec.zoning = undefined
            }
            normDec._version = decisionsVersion
            await decisions.insertOne(normDec, { bypassDocumentValidation: true })
            normalizeCount++
          } else if (normalized.locked === false) {
            if (updated === true || normalized._version !== decisionsVersion || !normalized.zoning || (normalized.zoning && normalized.zoning.detail)) {
              let normDec = JurinetUtils.Normalize(row, normalized)
              if (normDec.pseudoText) {
                try {
                  normDec.zoning = await getZones(normDec.sourceId, normDec.sourceName, normDec.pseudoText)
                  if (!normDec.zoning || (normDec.zoning && normDec.zoning.detail)) {
                    fs.appendFileSync(path.join(__dirname, 'zoningerror_jurinet.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(normDec.zoning) }) + '\n')
                    console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(normDec.zoning))
                  }
                } catch (e) {
                  fs.appendFileSync(path.join(__dirname, 'zoningerror_jurinet.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(e) }) + '\n')
                  console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(e))
                  normDec.zoning = undefined
                }
              } else {
                normDec.zoning = undefined
              }
              normDec._version = decisionsVersion
              await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, { bypassDocumentValidation: true })
              normalizeCount++
            }
          }
        } catch (e) {
          console.error(e)
          errorCount++
        }
      } else {
        try {
          let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurinet' })
          if (normalized !== null) {
            await decisions.deleteOne({ _id: normalized[process.env.MONGO_ID] })
          }
        } catch (e) {
          console.error(e)
          errorCount++
        }
      }

      jurinetOffset++
    }
    console.log(`Jurinet (${oldOffset}-${(oldOffset + batchSize)}) New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Error: ${errorCount}.`)
    if (newCount === 0 && updateCount === 0 && normalizeCount === 0) {
      jurinetEmptyRoundCount++
    } else {
      jurinetEmptyRoundCount = 0
    }
    await client.close()
  } else {
    jurinetOffset = 0
    jurinetEmptyRoundCount = 0
  }

  // PROCESS JURICA
  await juricaSource.connect()
  const juricaResult = await juricaSource.getBatch({
    offset: juricaOffset,
    limit: batchSize,
    all: true,
    titrage: false,
    order: juricaOrder
  })
  await juricaSource.close()

  if (juricaResult) {
    if (juricaOrder === 'DESC') {
      juricaResult.sort((a, b) => {
        if (a[process.env.MONGO_ID] < b[process.env.MONGO_ID]) {
          return -1
        }
        if (a[process.env.MONGO_ID] > b[process.env.MONGO_ID]) {
          return 1
        }
        return 0
      })
    }
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true
    })
    await client.connect()
    const database = client.db(process.env.MONGO_DBNAME)
    const collection = database.collection(process.env.MONGO_JURICA_COLLECTION)
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION)
    let newCount = 0
    let updateCount = 0
    let normalizeCount = 0
    let errorCount = 0
    let oldOffset = juricaOffset
    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i]
      let updated = false
      const hash = crypto.createHash('md5').update(JSON.stringify(row)).digest('hex')
      if (juricaHashes[row[process.env.MONGO_ID]] === undefined) {
        try {
          await collection.insertOne(row, { bypassDocumentValidation: true })
          juricaHashes[row[process.env.MONGO_ID]] = hash
          newCount++
        } catch (e) {
          console.error(e)
          errorCount++
        }
      } else if (juricaHashes[row[process.env.MONGO_ID]] !== hash) {
        try {
          await collection.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true })
          juricaHashes[row[process.env.MONGO_ID]] = hash
          updated = true
          updateCount++
        } catch (e) {
          console.error(e)
          errorCount++
        }
      }

      try {
        let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurica' })
        if (normalized === null) {
          let normDec = JuricaUtils.Normalize(row)
          if (normDec.pseudoText) {
            try {
              normDec.zoning = await getZones(normDec.sourceId, normDec.sourceName, normDec.pseudoText)
              if (!normDec.zoning || (normDec.zoning && normDec.zoning.detail)) {
                fs.appendFileSync(path.join(__dirname, 'zoningerror_jurica.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(normDec.zoning) }) + '\n')
                console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(normDec.zoning))
              }
            } catch (e) {
              fs.appendFileSync(path.join(__dirname, 'zoningerror_jurica.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(e) }) + '\n')
              console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(e))
              normDec.zoning = undefined
            }
          } else {
            normDec.zoning = undefined
          }
          normDec._version = decisionsVersion
          await decisions.insertOne(normDec, { bypassDocumentValidation: true })
          normalizeCount++
        } else if (normalized.locked === false) {
          if (updated === true || normalized._version !== decisionsVersion || !normalized.zoning || (normalized.zoning && normalized.zoning.detail)) {
            let normDec = JuricaUtils.Normalize(row, normalized)
            if (normDec.pseudoText) {
              try {
                normDec.zoning = await getZones(normDec.sourceId, normDec.sourceName, normDec.pseudoText)
                if (!normDec.zoning || (normDec.zoning && normDec.zoning.detail)) {
                  fs.appendFileSync(path.join(__dirname, 'zoningerror_jurica.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(normDec.zoning) }) + '\n')
                  console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(normDec.zoning))
                }
              } catch (e) {
                fs.appendFileSync(path.join(__dirname, 'zoningerror_jurica.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(e) }) + '\n')
                console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(e))
                normDec.zoning = undefined
              }
            } else {
              normDec.zoning = undefined
            }
            normDec._version = decisionsVersion
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, { bypassDocumentValidation: true })
            normalizeCount++
          }
        }
      } catch (e) {
        console.error(e)
        errorCount++
      }

      juricaOffset++
    }
    console.log(`Jurica (${oldOffset}-${(oldOffset + batchSize)}) New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Error: ${errorCount}.`)
    if (newCount === 0 && updateCount === 0 && normalizeCount === 0) {
      juricaEmptyRoundCount++
    } else {
      juricaEmptyRoundCount = 0
    }
    await client.close()
  } else {
    juricaOffset = 0
    juricaEmptyRoundCount = 0
  }

  console.log('Teardown Main Loop...')

  // UPDATE histories
  fs.writeFileSync(path.join(__dirname, 'offset.history'), `${jurinetOffset}`)
  fs.writeFileSync(path.join(__dirname, 'emptyround.history'), `${jurinetEmptyRoundCount}`)
  fs.writeFileSync(path.join(__dirname, 'offset_jurica.history'), `${juricaOffset}`)
  fs.writeFileSync(path.join(__dirname, 'emptyround_jurica.history'), `${juricaEmptyRoundCount}`)
  let hashesContent = ''
  for (let id in jurinetHashes) {
    hashesContent += `${id}:${jurinetHashes[id]}\n`
  }
  fs.writeFileSync(path.join(__dirname, 'hashes.history'), hashesContent.trim())
  hashesContent = ''
  for (let id in juricaHashes) {
    hashesContent += `${id}:${juricaHashes[id]}\n`
  }
  fs.writeFileSync(path.join(__dirname, 'hashes_jurica.history'), hashesContent.trim())

  console.log('Exit Main Loop.')
}

// Short loop
async function mainShort() {

  // PROCESS JURINET
  await jurinetSource.connect()
  const jurinetResult = await jurinetSource.getBatch({
    offset: 0,
    limit: 5000,
    all: true,
    titrage: true,
    order: jurinetOrder
  })
  await jurinetSource.close()

  if (jurinetResult) {
    if (jurinetOrder === 'DESC') {
      jurinetResult.sort((a, b) => {
        if (a[process.env.MONGO_ID] < b[process.env.MONGO_ID]) {
          return -1
        }
        if (a[process.env.MONGO_ID] > b[process.env.MONGO_ID]) {
          return 1
        }
        return 0
      })
    }
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true
    })
    await client.connect()
    const database = client.db(process.env.MONGO_DBNAME)
    const collection = database.collection(process.env.MONGO_JURINET_COLLECTION)
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION)
    let newCount = 0
    let updateCount = 0
    let normalizeCount = 0
    let errorCount = 0
    for (let i = 0; i < jurinetResult.length; i++) {
      let row = jurinetResult[i]
      let updated = false
      const hash = crypto.createHash('md5').update(JSON.stringify(row)).digest('hex')
      if (jurinetHashes[row[process.env.MONGO_ID]] === undefined) {
        try {
          await collection.insertOne(row, { bypassDocumentValidation: true })
          jurinetHashes[row[process.env.MONGO_ID]] = hash
          newCount++
        } catch (e) {
          console.error(e)
          errorCount++
        }
      } else if (jurinetHashes[row[process.env.MONGO_ID]] !== hash) {
        try {
          await collection.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true })
          jurinetHashes[row[process.env.MONGO_ID]] = hash
          updated = true
          updateCount++
        } catch (e) {
          console.error(e)
          errorCount++
        }
      }

      if (row['AUT_CREATION'] !== 'WINCI' && row['TYPE_ARRET'] === 'CC') {
        try {
          let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurinet' })
          if (normalized === null) {
            let normDec = JurinetUtils.Normalize(row)
            if (normDec.pseudoText) {
              try {
                normDec.zoning = await getZones(normDec.sourceId, normDec.sourceName, normDec.pseudoText)
                if (!normDec.zoning || (normDec.zoning && normDec.zoning.detail)) {
                  fs.appendFileSync(path.join(__dirname, 'zoningerror_jurinet.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(normDec.zoning) }) + '\n')
                  console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(normDec.zoning))
                }
              } catch (e) {
                fs.appendFileSync(path.join(__dirname, 'zoningerror_jurinet.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(e) }) + '\n')
                console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(e))
                normDec.zoning = undefined
              }
            } else {
              normDec.zoning = undefined
            }
            normDec._version = decisionsVersion
            await decisions.insertOne(normDec, { bypassDocumentValidation: true })
            normalizeCount++
          } else if (normalized.locked === false) {
            if (updated === true || normalized._version !== decisionsVersion || !normalized.zoning || (normalized.zoning && normalized.zoning.detail)) {
              let normDec = JurinetUtils.Normalize(row, normalized)
              if (normDec.pseudoText) {
                try {
                  normDec.zoning = await getZones(normDec.sourceId, normDec.sourceName, normDec.pseudoText)
                  if (!normDec.zoning || (normDec.zoning && normDec.zoning.detail)) {
                    fs.appendFileSync(path.join(__dirname, 'zoningerror_jurinet.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(normDec.zoning) }) + '\n')
                    console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(normDec.zoning))
                  }
                } catch (e) {
                  fs.appendFileSync(path.join(__dirname, 'zoningerror_jurinet.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(e) }) + '\n')
                  console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(e))
                  normDec.zoning = undefined
                }
              } else {
                normDec.zoning = undefined
              }
              normDec._version = decisionsVersion
              await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, { bypassDocumentValidation: true })
              normalizeCount++
            }
          }
        } catch (e) {
          console.error(e)
          errorCount++
        }
      } else {
        try {
          let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurinet' })
          if (normalized !== null) {
            await decisions.deleteOne({ _id: normalized[process.env.MONGO_ID] })
          }
        } catch (e) {
          console.error(e)
          errorCount++
        }
      }

      jurinetOffset++
    }
    console.log(`Jurinet (latest 5000) New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Error: ${errorCount}.`)
    await client.close()
  }

  // PROCESS JURICA
  await juricaSource.connect()
  const juricaResult = await juricaSource.getBatch({
    offset: 0,
    limit: 5000,
    all: true,
    titrage: false,
    order: juricaOrder
  })
  await juricaSource.close()

  if (juricaResult) {
    if (juricaOrder === 'DESC') {
      juricaResult.sort((a, b) => {
        if (a[process.env.MONGO_ID] < b[process.env.MONGO_ID]) {
          return -1
        }
        if (a[process.env.MONGO_ID] > b[process.env.MONGO_ID]) {
          return 1
        }
        return 0
      })
    }
    const client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true
    })
    await client.connect()
    const database = client.db(process.env.MONGO_DBNAME)
    const collection = database.collection(process.env.MONGO_JURICA_COLLECTION)
    const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION)
    let newCount = 0
    let updateCount = 0
    let normalizeCount = 0
    let errorCount = 0
    for (let i = 0; i < juricaResult.length; i++) {
      let row = juricaResult[i]
      let updated = false
      const hash = crypto.createHash('md5').update(JSON.stringify(row)).digest('hex')
      if (juricaHashes[row[process.env.MONGO_ID]] === undefined) {
        try {
          await collection.insertOne(row, { bypassDocumentValidation: true })
          juricaHashes[row[process.env.MONGO_ID]] = hash
          newCount++
        } catch (e) {
          console.error(e)
          errorCount++
        }
      } else if (juricaHashes[row[process.env.MONGO_ID]] !== hash) {
        try {
          await collection.replaceOne({ _id: row[process.env.MONGO_ID] }, row, { bypassDocumentValidation: true })
          juricaHashes[row[process.env.MONGO_ID]] = hash
          updated = true
          updateCount++
        } catch (e) {
          console.error(e)
          errorCount++
        }
      }

      try {
        let normalized = await decisions.findOne({ sourceId: row[process.env.MONGO_ID], sourceName: 'jurica' })
        if (normalized === null) {
          let normDec = JuricaUtils.Normalize(row)
          if (normDec.pseudoText) {
            try {
              normDec.zoning = await getZones(normDec.sourceId, normDec.sourceName, normDec.pseudoText)
              if (!normDec.zoning || (normDec.zoning && normDec.zoning.detail)) {
                fs.appendFileSync(path.join(__dirname, 'zoningerror_jurica.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(normDec.zoning) }) + '\n')
                console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(normDec.zoning))
              }
            } catch (e) {
              fs.appendFileSync(path.join(__dirname, 'zoningerror_jurica.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(e) }) + '\n')
              console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(e))
              normDec.zoning = undefined
            }
          } else {
            normDec.zoning = undefined
          }
          normDec._version = decisionsVersion
          await decisions.insertOne(normDec, { bypassDocumentValidation: true })
          normalizeCount++
        } else if (normalized.locked === false) {
          if (updated === true || normalized._version !== decisionsVersion || !normalized.zoning || (normalized.zoning && normalized.zoning.detail)) {
            let normDec = JuricaUtils.Normalize(row, normalized)
            if (normDec.pseudoText) {
              try {
                normDec.zoning = await getZones(normDec.sourceId, normDec.sourceName, normDec.pseudoText)
                if (!normDec.zoning || (normDec.zoning && normDec.zoning.detail)) {
                  fs.appendFileSync(path.join(__dirname, 'zoningerror_jurica.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(normDec.zoning) }) + '\n')
                  console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(normDec.zoning))
                }
              } catch (e) {
                fs.appendFileSync(path.join(__dirname, 'zoningerror_jurica.log'), JSON.stringify({ id: normDec.sourceId, error: parseError(e) }) + '\n')
                console.error(normDec.sourceName, normDec.sourceId, 'zoning error', parseError(e))
                normDec.zoning = undefined
              }
            } else {
              normDec.zoning = undefined
            }
            normDec._version = decisionsVersion
            await decisions.replaceOne({ _id: normalized[process.env.MONGO_ID] }, normDec, { bypassDocumentValidation: true })
            normalizeCount++
          }
        }
      } catch (e) {
        console.error(e)
        errorCount++
      }

      juricaOffset++
    }
    console.log(`Jurica (latest 5000) New: ${newCount}, Update: ${updateCount}, Normalize: ${normalizeCount}, Error: ${errorCount}.`)
    await client.close()
  }

  console.log('Teardown Short Loop...')

  // UPDATE histories
  let hashesContent = ''
  for (let id in jurinetHashes) {
    hashesContent += `${id}:${jurinetHashes[id]}\n`
  }
  fs.writeFileSync(path.join(__dirname, 'hashes.history'), hashesContent.trim())
  hashesContent = ''
  for (let id in juricaHashes) {
    hashesContent += `${id}:${juricaHashes[id]}\n`
  }
  fs.writeFileSync(path.join(__dirname, 'hashes_jurica.history'), hashesContent.trim())

  console.log('Exit Short Loop.')

  return true
}

async function getZones(id, source, text) {
  const zoneData = JSON.stringify({
    arret_id: id,
    source: source,
    text: text
  })
  const response = await needle('post', 'http://10.16.64.7:8090/zonage', zoneData, {
    json: true
  })
  delete response.body.arret_id
  return response.body
}

console.log('Run...')

if (process.argv[2] === 'short') {
  mainShort()
} else {
  main()
}

