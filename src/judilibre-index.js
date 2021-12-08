const { MongoClient } = require('mongodb');
const { JurinetUtils } = require('./jurinet-utils');
const { JuricaUtils } = require('./jurica-utils');
const { DateTime } = require('luxon');

class JudilibreIndex {
  constructor() {
    this.handler = {
      connected: false,
      connection: null,
      client: null,
      collections: {
        mainIndex: null,
      },
    };
  }

  async buildJurinetDocument(doc, duplicateId) {
    let indexedDoc;
    try {
      const normalized = await JurinetUtils.Normalize(doc);
      indexedDoc = {
        _id: `jurinet:${doc._id}`,
        reference: JurinetUtils.GetDecisionNumberForIndexing(normalized, normalized.zoning).map((item) => {
          return item.replace(/[^\d/.-]/gm, '').trim();
        }),
        sderId: null,
        judilibreId: null,
        juridiction: `${doc.JURIDICTION}`.toLowerCase().trim(),
        ccass: doc.TYPE_ARRET === 'CC',
        deleted: false,
        public: true,
        date: JurinetUtils.GetDecisionDateForIndexing(normalized.dateDecision),
        duplicates: [],
        decatt: [],
        log: [],
        lastOperation: null,
        error: null,
      };
    } catch (e) {
      let dateDecision = null;
      if (doc.DT_DECISION && typeof doc.DT_DECISION.toISOString === 'function') {
        dateDecision = doc.DT_DECISION.toISOString();
      }
      indexedDoc = {
        _id: `jurinet:${doc._id}`,
        reference: [],
        sderId: null,
        judilibreId: null,
        juridiction: `${doc.JURIDICTION}`.toLowerCase().trim(),
        ccass: doc.TYPE_ARRET === 'CC',
        deleted: false,
        public: true,
        date: JurinetUtils.GetDecisionDateForIndexing(dateDecision),
        duplicates: [],
        decatt: [],
        log: [],
        lastOperation: null,
        error: JSON.stringify(e, Object.getOwnPropertyNames(e)),
      };
    }
    let newRef = [];
    indexedDoc.reference.forEach((ref) => {
      if (newRef.indexOf(ref) === -1) {
        newRef.push(ref);
      }
      let refStrip = ref.replace(/[^\w\d]/gm, '').trim();
      if (refStrip !== ref && newRef.indexOf(refStrip) === -1) {
        newRef.push(refStrip);
      }
    });
    indexedDoc.reference = newRef;
    if (doc._decatt && Array.isArray(doc._decatt) && doc._decatt.length > 0) {
      for (let d = 0; d < doc._decatt.length; d++) {
        indexedDoc.decatt.push(`jurica:${doc._decatt[d]}`);
      }
    }
    if (duplicateId) {
      if (Array.isArray(duplicateId)) {
        indexedDoc.duplicates = duplicateId;
      } else {
        indexedDoc.duplicates = [duplicateId];
      }
    }
    return indexedDoc;
  }

  async indexJurinetDocument(doc, duplicateId, msg, err) {
    const indexedDoc = await this.buildJurinetDocument(doc, duplicateId);
    const lastOperation = DateTime.fromJSDate(new Date());
    indexedDoc.lastOperation = lastOperation.toISODate();
    if (msg) {
      indexedDoc.log.unshift({
        date: new Date(),
        msg: msg,
      });
    }
    if (err) {
      if (typeof err === 'object') {
        indexedDoc.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
      } else {
        indexedDoc.error = err;
      }
    }
    await this.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
  }

  async updateJurinetDocument(doc, duplicateId, msg, err) {
    const indexedDoc = await this.buildJurinetDocument(doc, duplicateId);
    const existingDoc = await this.findOne('mainIndex', { _id: indexedDoc._id });
    if (existingDoc !== null) {
      indexedDoc.sderId = existingDoc.sderId;
      indexedDoc.judilibreId = existingDoc.judilibreId;
      indexedDoc.juridiction = existingDoc.juridiction;
      indexedDoc.deleted = existingDoc.deleted;
      indexedDoc.public = existingDoc.public;
      indexedDoc.log = existingDoc.log;
      indexedDoc.error = existingDoc.error;
      existingDoc.duplicates.forEach((item) => {
        if (indexedDoc.duplicates.indexOf(item) === -1) {
          indexedDoc.duplicates.push(item);
        }
      });
      existingDoc.decatt.forEach((item) => {
        if (indexedDoc.decatt.indexOf(item) === -1) {
          indexedDoc.decatt.push(item);
        }
      });
      const lastOperation = DateTime.fromJSDate(new Date());
      indexedDoc.lastOperation = lastOperation.toISODate();
      if (msg) {
        indexedDoc.log.unshift({
          date: new Date(),
          msg: msg,
        });
      }
      if (err) {
        if (typeof err === 'object') {
          indexedDoc.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
        } else {
          indexedDoc.error = err;
        }
      }
      await this.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, { bypassDocumentValidation: true });
    } else {
      const lastOperation = DateTime.fromJSDate(new Date());
      indexedDoc.lastOperation = lastOperation.toISODate();
      if (msg) {
        indexedDoc.log.unshift({
          date: new Date(),
          msg: msg,
        });
      }
      if (err) {
        if (typeof err === 'object') {
          indexedDoc.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
        } else {
          indexedDoc.error = err;
        }
      }
      await this.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
    }
  }

  async buildJuricaDocument(doc, duplicateId) {
    let indexedDoc;
    try {
      const normalized = await JuricaUtils.Normalize(doc);
      indexedDoc = {
        _id: `jurica:${doc._id}`,
        reference: JuricaUtils.GetDecisionNumberForIndexing(normalized).map((item) => {
          return item.replace(/[^\d/.-]/gm, '').trim();
        }),
        sderId: null,
        judilibreId: null,
        juridiction: `${doc.JDEC_JURIDICTION}`.toLowerCase().trim(),
        ccass: false,
        deleted: false,
        public: null,
        date: JuricaUtils.GetDecisionDateForIndexing(normalized.dateDecision),
        duplicates: [],
        decatt: [],
        log: [],
        lastOperation: null,
        error: null,
      };
    } catch (e) {
      let dateDecision = null;
      if (doc.JDEC_DATE && typeof doc.JDEC_DATE === 'string') {
        dateDecision = new Date();
        let dateDecisionElements = doc.JDEC_DATE.split('-');
        dateDecision.setFullYear(parseInt(dateDecisionElements[0], 10));
        dateDecision.setMonth(parseInt(dateDecisionElements[1], 10) - 1);
        dateDecision.setDate(parseInt(dateDecisionElements[2], 10));
        dateDecision.setHours(0);
        dateDecision.setMinutes(0);
        dateDecision.setSeconds(0);
        dateDecision.setMilliseconds(0);
        dateDecision = dateDecision.toISOString();
      }
      indexedDoc = {
        _id: `jurica:${doc._id}`,
        reference: [],
        sderId: null,
        judilibreId: null,
        juridiction: `${doc.JDEC_JURIDICTION}`.toLowerCase().trim(),
        ccass: false,
        deleted: false,
        public: null,
        date: JuricaUtils.GetDecisionDateForIndexing(dateDecision),
        duplicates: [],
        decatt: [],
        log: [],
        lastOperation: null,
        error: JSON.stringify(e, Object.getOwnPropertyNames(e)),
      };
    }
    let newRef = [];
    indexedDoc.reference.forEach((ref) => {
      if (newRef.indexOf(ref) === -1) {
        newRef.push(ref);
      }
      let refStrip = ref.replace(/[^\w\d]/gm, '').trim();
      if (refStrip !== ref && newRef.indexOf(refStrip) === -1) {
        newRef.push(refStrip);
      }
    });
    indexedDoc.reference = newRef;
    if (duplicateId) {
      if (Array.isArray(duplicateId)) {
        indexedDoc.duplicates = duplicateId;
      } else {
        indexedDoc.duplicates = [duplicateId];
      }
    }
    return indexedDoc;
  }

  async indexJuricaDocument(doc, duplicateId, msg, err) {
    const indexedDoc = await this.buildJuricaDocument(doc, duplicateId);
    const lastOperation = DateTime.fromJSDate(new Date());
    indexedDoc.lastOperation = lastOperation.toISODate();
    if (msg) {
      indexedDoc.log.unshift({
        date: new Date(),
        msg: msg,
      });
    }
    if (err) {
      if (typeof err === 'object') {
        indexedDoc.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
      } else {
        indexedDoc.error = err;
      }
    }
    await this.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
  }

  async updateJuricaDocument(doc, duplicateId, msg, err) {
    const indexedDoc = await this.buildJuricaDocument(doc, duplicateId);
    const existingDoc = await this.findOne('mainIndex', { _id: indexedDoc._id });
    if (existingDoc !== null) {
      indexedDoc.sderId = existingDoc.sderId;
      indexedDoc.judilibreId = existingDoc.judilibreId;
      indexedDoc.juridiction = existingDoc.juridiction;
      indexedDoc.deleted = existingDoc.deleted;
      indexedDoc.public = existingDoc.public;
      indexedDoc.log = existingDoc.log;
      indexedDoc.error = existingDoc.error;
      existingDoc.duplicates.forEach((item) => {
        if (indexedDoc.duplicates.indexOf(item) === -1) {
          indexedDoc.duplicates.push(item);
        }
      });
      existingDoc.decatt.forEach((item) => {
        if (indexedDoc.decatt.indexOf(item) === -1) {
          indexedDoc.decatt.push(item);
        }
      });
      const lastOperation = DateTime.fromJSDate(new Date());
      indexedDoc.lastOperation = lastOperation.toISODate();
      if (msg) {
        indexedDoc.log.unshift({
          date: new Date(),
          msg: msg,
        });
      }
      if (err) {
        if (typeof err === 'object') {
          indexedDoc.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
        } else {
          indexedDoc.error = err;
        }
      }
      await this.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, { bypassDocumentValidation: true });
    } else {
      const lastOperation = DateTime.fromJSDate(new Date());
      indexedDoc.lastOperation = lastOperation.toISODate();
      if (msg) {
        indexedDoc.log.unshift({
          date: new Date(),
          msg: msg,
        });
      }
      if (err) {
        if (typeof err === 'object') {
          indexedDoc.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
        } else {
          indexedDoc.error = err;
        }
      }
      await this.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
    }
  }

  async indexDecisionDocument(doc, duplicateId, msg, err) {
    const existingDoc = await this.findOne('mainIndex', { _id: `${doc.sourceName}:${doc.sourceId}` });
    if (existingDoc) {
      existingDoc.sderId = doc._id;
      if (duplicateId) {
        if (Array.isArray(duplicateId)) {
          duplicateId.forEach((item) => {
            if (existingDoc.duplicates.indexOf(item) === -1) {
              existingDoc.duplicates.push(item);
            }
          });
        } else if (existingDoc.duplicates.indexOf(duplicateId) === -1) {
          existingDoc.duplicates.push(duplicateId);
        }
      }
      const lastOperation = DateTime.fromJSDate(new Date());
      existingDoc.lastOperation = lastOperation.toISODate();
      if (msg) {
        existingDoc.log.unshift({
          date: new Date(),
          msg: msg,
        });
      }
      if (err) {
        if (typeof err === 'object') {
          existingDoc.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
        } else {
          existingDoc.error = err;
        }
      }
      await this.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, { bypassDocumentValidation: true });
    }
  }

  async updateDecisionDocument(doc, duplicateId, msg, err) {
    const existingDoc = await this.findOne('mainIndex', { sderId: doc._id });
    if (existingDoc) {
      if (duplicateId) {
        if (Array.isArray(duplicateId)) {
          duplicateId.forEach((item) => {
            if (existingDoc.duplicates.indexOf(item) === -1) {
              existingDoc.duplicates.push(item);
            }
          });
        } else if (existingDoc.duplicates.indexOf(duplicateId) === -1) {
          existingDoc.duplicates.push(duplicateId);
        }
      }
      const lastOperation = DateTime.fromJSDate(new Date());
      existingDoc.lastOperation = lastOperation.toISODate();
      if (msg) {
        existingDoc.log.unshift({
          date: new Date(),
          msg: msg,
        });
      }
      if (err) {
        if (typeof err === 'object') {
          existingDoc.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
        } else {
          existingDoc.error = err;
        }
      }
      await this.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, { bypassDocumentValidation: true });
    }
  }

  getChamber(doc) {
    let chamber = null;
    if (typeof doc.ID_CHAMBRE === 'string' && doc.ID_CHAMBRE) {
      switch (doc.ID_CHAMBRE.toLowerCase().trim()) {
        case 'civ.1':
          chamber = 'première chambre civile';
          break;
        case 'civ.2':
          chamber = 'deuxième chambre civile';
          break;
        case 'civ.3':
          chamber = 'troisième chambre civile';
          break;
        case 'comm':
          chamber = 'chambre commerciale financière et économique';
          break;
        case 'cr':
          chamber = 'chambre criminelle';
          break;
        case 'soc':
          chamber = 'chambre sociale';
          break;
        case 'mi':
          chamber = 'chambre mixte';
          break;
        case 'pl':
          chamber = 'assemblée plénière';
          break;
        case 'ordo':
          chamber = 'première présidence ordonnance';
          break;
        case 'creun':
          chamber = 'chambres réunies';
          break;
      }
    } else if (typeof doc.JDEC_LIB_AUTORITE === 'string' && doc.JDEC_LIB_AUTORITE) {
      chamber = doc.JDEC_LIB_AUTORITE.toLowerCase().trim();
    }
    return chamber;
  }

  getHandler() {
    return this.handler;
  }

  getDbURI() {
    return process.env.INDEX_DB_URI;
  }

  getDbName() {
    return process.env.INDEX_DB_NAME;
  }

  async connect() {
    if (this.getHandler().connected === false) {
      this.getHandler().connection = new MongoClient(this.getDbURI(), {
        useUnifiedTopology: true,
      });
      await this.getHandler().connection.connect();
      this.getHandler().client = this.getHandler().connection.db(this.getDbName());
      for (let coll in this.getHandler().collections) {
        this.getHandler().collections[coll] = this.getHandler().client.collection(coll);
      }
      this.getHandler().connected = true;
    }
  }

  async close() {
    if (this.getHandler().connected === true) {
      await this.getHandler().connection.close();
      this.getHandler().connected = false;
    }
  }

  async find(collection, ...args) {
    await this.connect();
    if (!this.getHandler().collections[collection]) {
      throw new Error(`JudilibreIndex.find: unknown collection '${collection}'.`);
    }
    let doc;
    const result = [];
    const cursor = await this.getHandler().collections[collection].find.apply(
      this.getHandler().collections[collection],
      args,
    );
    while ((doc = await cursor.next())) {
      result.push(doc);
    }
    return result;
  }

  async findOne(collection, ...args) {
    await this.connect();
    if (!this.getHandler().collections[collection]) {
      throw new Error(`JudilibreIndex.findOne: unknown collection '${collection}'.`);
    }
    const result = await this.getHandler().collections[collection].findOne.apply(
      this.getHandler().collections[collection],
      args,
    );
    return result;
  }

  async insertOne(collection, ...args) {
    await this.connect();
    if (!this.getHandler().collections[collection]) {
      throw new Error(`JudilibreIndex.insertOne: unknown collection '${collection}'.`);
    }
    const result = await this.getHandler().collections[collection].insertOne.apply(
      this.getHandler().collections[collection],
      args,
    );
    return result;
  }

  async replaceOne(collection, ...args) {
    await this.connect();
    if (!this.getHandler().collections[collection]) {
      throw new Error(`JudilibreIndex.replaceOne: unknown collection '${collection}'.`);
    }
    const result = await this.getHandler().collections[collection].replaceOne.apply(
      this.getHandler().collections[collection],
      args,
    );
    return result;
  }

  async deleteOne(collection, ...args) {
    await this.connect();
    if (!this.getHandler().collections[collection]) {
      throw new Error(`JudilibreIndex.deleteOne: unknown collection '${collection}'.`);
    }
    const result = await this.getHandler().collections[collection].deleteOne.apply(
      this.getHandler().collections[collection],
      args,
    );
    return result;
  }

  async deleteMany(collection, ...args) {
    await this.connect();
    if (!this.getHandler().collections[collection]) {
      throw new Error(`JudilibreIndex.deleteMany: unknown collection '${collection}'.`);
    }
    const result = await this.getHandler().collections[collection].deleteMany.apply(
      this.getHandler().collections[collection],
      args,
    );
    return result;
  }

  async dropIndexes(collection, ...args) {
    await this.connect();
    if (!this.getHandler().collections[collection]) {
      throw new Error(`JudilibreIndex.dropIndexes: unknown collection '${collection}'.`);
    }
    const result = await this.getHandler().collections[collection].dropIndexes.apply(
      this.getHandler().collections[collection],
      args,
    );
    return result;
  }

  async createIndex(collection, ...args) {
    await this.connect();
    if (!this.getHandler().collections[collection]) {
      throw new Error(`JudilibreIndex.createIndex: unknown collection '${collection}'.`);
    }
    const result = await this.getHandler().collections[collection].createIndex.apply(
      this.getHandler().collections[collection],
      args,
    );
    return result;
  }
}

exports.JudilibreIndex = new JudilibreIndex();
