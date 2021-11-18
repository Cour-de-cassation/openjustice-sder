const { MongoClient } = require('mongodb');
const { JurinetUtils } = require('./jurinet-utils');
const { JuricaUtils } = require('./jurica-utils');

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
    const normalized = await JurinetUtils.Normalize(doc);
    const indexedDoc = {
      _id: `jurinet:${doc._id}`,
      reference: JurinetUtils.GetDecisionNumberForIndexing(normalized, normalized.zoning),
      sderId: null,
      judilibreId: null,
      ccass: doc.TYPE_ARRET === 'CC',
      deleted: false,
      public: true,
      date: JurinetUtils.GetDecisionDateForIndexing(normalized.dateDecision),
      duplicates: [],
      log: [],
    };
    if (duplicateId) {
      if (Array.isArray(duplicateId)) {
        indexedDoc.duplicates = duplicateId;
      } else {
        indexedDoc.duplicates = [duplicateId];
      }
    }
    return indexedDoc;
  }

  async indexJurinetDocument(doc, duplicateId, msg) {
    const indexedDoc = await this.buildJurinetDocument(doc, duplicateId);
    indexedDoc.log.unshift({
      date: new Date(),
      msg: msg,
    });
    await this.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
  }

  async updateJurinetDocument(doc, duplicateId, msg) {
    const indexedDoc = await this.buildJurinetDocument(doc, duplicateId);
    const existingDoc = await this.findOne('mainIndex', { _id: indexedDoc._id });
    if (existingDoc !== null) {
      indexedDoc.sderId = existingDoc.sderId;
      indexedDoc.judilibreId = existingDoc.judilibreId;
      indexedDoc.deleted = existingDoc.deleted;
      indexedDoc.public = existingDoc.public;
      indexedDoc.log = existingDoc.log;
      existingDoc.duplicates.forEach((item) => {
        if (indexedDoc.duplicates.indexOf(item) === -1) {
          indexedDoc.duplicates.push(item);
        }
      });
      indexedDoc.log.unshift({
        date: new Date(),
        msg: msg,
      });
      await this.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, { bypassDocumentValidation: true });
    } else {
      indexedDoc.log.unshift({
        date: new Date(),
        msg: msg,
      });
      await this.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
    }
  }

  async buildJuricaDocument(doc, duplicateId) {
    const normalized = await JuricaUtils.Normalize(doc);
    const indexedDoc = {
      _id: `jurica:${doc._id}`,
      reference: JuricaUtils.GetDecisionNumberForIndexing(normalized),
      sderId: null,
      judilibreId: null,
      ccass: false,
      deleted: false,
      public: null,
      date: JuricaUtils.GetDecisionDateForIndexing(normalized.dateDecision),
      duplicates: [],
      log: [],
    };
    if (duplicateId) {
      if (Array.isArray(duplicateId)) {
        indexedDoc.duplicates = duplicateId;
      } else {
        indexedDoc.duplicates = [duplicateId];
      }
    }
    return indexedDoc;
  }

  async indexJuricaDocument(doc, duplicateId, msg) {
    const indexedDoc = await this.buildJuricaDocument(doc, duplicateId);
    indexedDoc.log.unshift({
      date: new Date(),
      msg: msg,
    });
    await this.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
  }

  async updateJuricaDocument(doc, duplicateId, msg) {
    const indexedDoc = await this.buildJuricaDocument(doc, duplicateId);
    const existingDoc = await this.findOne('mainIndex', { _id: indexedDoc._id });
    if (existingDoc !== null) {
      indexedDoc.sderId = existingDoc.sderId;
      indexedDoc.judilibreId = existingDoc.judilibreId;
      indexedDoc.deleted = existingDoc.deleted;
      indexedDoc.public = existingDoc.public;
      indexedDoc.log = existingDoc.log;
      existingDoc.duplicates.forEach((item) => {
        if (indexedDoc.duplicates.indexOf(item) === -1) {
          indexedDoc.duplicates.push(item);
        }
      });
      indexedDoc.log.unshift({
        date: new Date(),
        msg: msg,
      });
      await this.replaceOne('mainIndex', { _id: indexedDoc._id }, indexedDoc, { bypassDocumentValidation: true });
    } else {
      indexedDoc.log.unshift({
        date: new Date(),
        msg: msg,
      });
      await this.insertOne('mainIndex', indexedDoc, { bypassDocumentValidation: true });
    }
  }

  async indexDecisionDocument(doc, duplicateId, msg) {
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
      existingDoc.log.unshift({
        date: new Date(),
        msg: msg,
      });
      await this.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, { bypassDocumentValidation: true });
    }
  }

  async updateDecisionDocument(doc, duplicateId, msg) {
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
      existingDoc.log.unshift({
        date: new Date(),
        msg: msg,
      });
      await this.replaceOne('mainIndex', { _id: existingDoc._id }, existingDoc, { bypassDocumentValidation: true });
    }
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
