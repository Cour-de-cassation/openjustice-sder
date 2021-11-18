const { MongoClient } = require('mongodb');

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
