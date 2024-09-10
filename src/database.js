const { MongoClient, ObjectId } = require('mongodb');
const iconv = require('iconv-lite');
iconv.skipDecodeWarning = true;
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Switch to "Thick Mode" (because Jurica uses an archaic version of Oracle, cf. https://node-oracledb.readthedocs.io/en/latest/user_guide/initialization.html#enabling-node-oracledb-thick-mode-on-linux-and-related-platforms):
oracledb.initOracleClient();

const logger = console;

class Database {
  constructor() {
    this.handlers = {
      sder: {
        isMongo: true,
        connected: false,
        connection: null,
        client: null,
        collections: {
          codenacs: null,
          decisions: null,
          rawDILA: null,
          rawJurica: null,
          rawJurinet: null,
        },
      },
      index: {
        isMongo: true,
        connected: false,
        connection: null,
        client: null,
        collections: {
          affaires: null,
          mainIndex: null,
          exceptions: null,
        },
      },
      si: {
        isMongo: false,
        connection: null,
        collections: {
          jurinet: null,
          jurica: null,
          penal: null,
          com: null,
        },
      },
    };
  }

  getHandler(collection) {
    if (/^sder\./i.test(collection) === true) {
      return this.handlers.sder;
    }
    if (/^index\./i.test(collection) === true) {
      return this.handlers.index;
    }
    if (/^si\./i.test(collection) === true) {
      return this.handlers.si;
    }
    throw new Error(`getHandler: no handler for collection '${collection}'.`);
  }

  getDbURI(collection) {
    if (/^sder\./i.test(collection) === true) {
      return process.env.MONGO_URI;
    }
    if (/^index\./i.test(collection) === true) {
      return process.env.INDEX_DB_URI;
    }
    if (/^si\.jurinet/i.test(collection) === true) {
      return process.env.SI_JURINET_DB_URI;
    }
    if (/^si\.jurica/i.test(collection) === true) {
      return process.env.SI_JURICA_DB_URI;
    }
    if (/^si\.penal/i.test(collection) === true) {
      return process.env.SI_PENAL_DB_URI;
    }
    if (/^si\.com/i.test(collection) === true) {
      return process.env.SI_COM_DB_URI;
    }
    throw new Error(`getDbURI: no database URI for collection '${collection}'.`);
  }

  getDbName(collection) {
    if (/^sder\./i.test(collection) === true) {
      return process.env.MONGO_DBNAME;
    }
    if (/^index\./i.test(collection) === true) {
      return process.env.INDEX_DB_NAME;
    }
    if (/^si\.jurinet/i.test(collection) === true) {
      return process.env.SI_JURINET_DB_NAME;
    }
    if (/^si\.jurica/i.test(collection) === true) {
      return process.env.SI_JURICA_DB_NAME;
    }
    if (/^si\.penal/i.test(collection) === true) {
      return process.env.SI_PENAL_DB_NAME;
    }
    if (/^si\.com/i.test(collection) === true) {
      return process.env.SI_COM_DB_NAME;
    }
    throw new Error(`getDbName: no database name for collection '${collection}'.`);
  }

  async connect(collection) {
    const handler = this.getHandler(collection);
    if (handler.isMongo === true) {
      if (handler.connected === false) {
        handler.connection = new MongoClient(this.getDbURI(collection));
        await handler.connection.connect();
        handler.client = handler.connection.db(this.getDbName(collection));
        for (let coll in handler.collections) {
          handler.collections[coll] = handler.client.collection(coll);
        }
        handler.connected = true;
      }
    } else {
      const [login, host] = this.getDbURI(collection).split('@');
      const [user, password] = login.split(':');
      logger.warn(
        {
          user: user,
          password: password,
          connectString: host,
        },
        `trying to connect to Oracle collection ${collection}`,
      );

      handler.connection = await oracledb.getConnection({
        user: user,
        password: password,
        connectString: host,
      });
      for (let coll in handler.collections) {
        handler.collections[coll] = true;
      }

      logger.info(
        {
          user: user,
          password: password,
          connectString: host,
        },
        `connected to Oracle collection ${collection}`,
      );
    }
  }

  async close(collection) {
    const handler = this.getHandler(collection);
    if (handler.isMongo === true) {
      if (handler.connected === true) {
        await handler.connection.close();
        for (let coll in handler.collections) {
          handler.collections[coll] = null;
        }
        handler.connected = false;
      }
    } else {
      await handler.connection.close();
      for (let coll in handler.collections) {
        handler.collections[coll] = null;
      }
    }
  }

  async convertFromOracle(row) {
    let data = {};
    for (let key in row) {
      switch (key) {
        case 'ID_DOCUMENT':
          data._id = row[key];
          data.ID_DOCUMENT = row[key];
          break;
        case 'JDEC_ID':
          data._id = row[key];
          data.JDEC_ID = row[key];
          break;
        case 'rnum':
          // Ignore rnum key (added by offset/limit queries)
          break;
        case 'RNUM':
          // Ignore RNUM key (added by offset/limit queries)
          break;
        default:
          if (row[key] && typeof row[key].getData === 'function') {
            data[key] = await row[key].getData();
          } else {
            data[key] = row[key];
          }
          if (Buffer.isBuffer(data[key])) {
            data[key] = this.decodeOracleText(data[key]);
          }
          break;
      }
    }
    return data;
  }

  decodeOracleText(text) {
    return iconv.decode(text, 'CP1252');
  }

  encodeOracleText(text) {
    return iconv.encode(text, 'CP1252');
  }

  buildOracleReadQuery(collection, args) {
    let query = `SELECT * FROM ${this.getDbName(collection)}`;
    let params = [];
    if (Array.isArray(args)) {
      if (args.length === 1) {
        if (typeof args[0] === 'string') {
          query = args[0];
        }
      } else if (args.length === 2) {
        if (typeof args[0] === 'string') {
          query = args[0];
        }
        if (Array.isArray(args[1])) {
          params = args[1];
        }
      }
    }
    if (
      /^select\s/i.test(query) === false ||
      /insert\s/i.test(query) === true ||
      /update\s/i.test(query) === true ||
      /delete\s/i.test(query) === true ||
      /drop\s/i.test(query) === true ||
      /set\s/i.test(query) === true ||
      /create\s/i.test(query) === true ||
      /rename\s/i.test(query) === true ||
      /grant\s/i.test(query) === true ||
      /revoke\s/i.test(query) === true ||
      /lock\s/i.test(query) === true ||
      /upsert\s/i.test(query) === true ||
      /truncate\s/i.test(query) === true ||
      /purge\s/i.test(query) === true ||
      /merge\s/i.test(query) === true ||
      /savepoint\s/i.test(query) === true ||
      /rollback\s/i.test(query) === true ||
      /flashback\s/i.test(query) === true ||
      /associate\s/i.test(query) === true ||
      /call\s/i.test(query) === true ||
      /comment\s/i.test(query) === true ||
      /administer\s/i.test(query) === true ||
      /alter\s/i.test(query) === true
    ) {
      throw new Error(`buildOracleReadQuery: cannot perform query '${query}' on collection '${collection}'.`);
    }
    return [query, params];
  }

  buildOracleWriteQuery(collection, args) {
    let query = `SELECT * FROM ${this.getDbName(collection)}`;
    let params = [];
    if (Array.isArray(args)) {
      if (args.length === 1) {
        if (typeof args[0] === 'string') {
          query = args[0];
        }
      } else if (args.length === 2) {
        if (typeof args[0] === 'string') {
          query = args[0];
        }
        if (Array.isArray(args[1])) {
          params = args[1];
        }
      }
    }
    return [query, params];
  }

  async oracleReadQuery(collection, args) {
    const handler = this.getHandler(collection);
    let row;
    const result = [];
    const [query, params] = this.buildOracleReadQuery(collection, args);
    console.log(`execute Oracle query`, query, params);
    const rs = await handler.connection.execute(query, params, {
      resultSet: true,
    });
    const rows = rs.resultSet;
    console.log(`converting result from Oracle`);
    while ((row = await rows.getRow())) {
      result.push(await this.convertFromOracle(row));
    }
    await rows.close();
    return result;
  }

  async oracleWriteQuery(collection, args) {
    if (parseInt(`${process.env.DB_READONLY}`, 10) === 1) {
      logger.error(args, `oracleWriteQuery denied on collection ${collection}`);
      return false;
    }
    logger.warn(args, `oracleWriteQuery performed on collection ${collection}`);
    const handler = this.getHandler(collection);
    let result = null;
    const [query, params] = this.buildOracleWriteQuery(collection, args);
    result = await handler.connection.execute(query, params, {
      autoCommit: true,
    });
    return result;
  }

  async writeQuery(collection, ...args) {
    if (parseInt(`${process.env.DB_READONLY}`, 10) === 1) {
      logger.error(args, `writeQuery denied on collection ${collection}`);
      return false;
    }
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`writeQuery: no handler for collection '${collection}'.`);
    }
    let result = [];
    if (handler.isMongo === true) {
      throw new Error(`writeQuery: operation not available for collection '${collection}'.`);
    } else {
      result = await this.oracleWriteQuery(collection, args);
    }
    return result;
  }

  async find(collection, ...args) {
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`find: no handler for collection '${collection}'.`);
    }
    let row;
    let result = [];
    if (handler.isMongo === true) {
      const cursor = await handler.collections[shortCollectionName].find.apply(
        handler.collections[shortCollectionName],
        args,
      );
      while ((row = await cursor.next())) {
        result.push(row);
      }
      await cursor.close();
    } else {
      result = await this.oracleReadQuery(collection, args);
    }
    return result;
  }

  async findCursor(collection, ...args) {
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`findCursor: no handler for collection '${collection}'.`);
    }
    if (handler.isMongo === true) {
      args.push({ allowDiskUse: true });
      return await handler.collections[shortCollectionName].find.apply(handler.collections[shortCollectionName], args);
    } else {
      throw new Error(`findCursor: method not supported for collection '${collection}'.`);
    }
  }

  async findOne(collection, ...args) {
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`findOne: no handler for collection '${collection}'.`);
    }
    let result = null;
    if (handler.isMongo === true) {
      result = await handler.collections[shortCollectionName].findOne.apply(
        handler.collections[shortCollectionName],
        args,
      );
    } else {
      const res = await this.oracleReadQuery(collection, args);
      if (Array.isArray(res) && res.length > 0) {
        result = res[0];
      }
    }
    return result;
  }

  async count(collection, ...args) {
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`count: no handler for collection '${collection}'.`);
    }
    let result = 0;
    if (handler.isMongo === true) {
      result = await handler.collections[shortCollectionName].countDocuments.apply(
        handler.collections[shortCollectionName],
        args,
      );
    } else {
      const res = await this.oracleReadQuery(collection, args);
      if (Array.isArray(res) && res.length > 0) {
        result = res.length;
      }
    }
    return result;
  }

  async insertOne(collection, ...args) {
    if (parseInt(`${process.env.DB_READONLY}`, 10) === 1) {
      logger.error(args, `insertOne denied on collection ${collection}`);
      return false;
    }
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`insertOne: no handler for collection '${collection}'.`);
    }
    let result = null;
    if (handler.isMongo === true) {
      args.push({
        bypassDocumentValidation: true,
      });
      result = await handler.collections[shortCollectionName].insertOne.apply(
        handler.collections[shortCollectionName],
        args,
      );
    } else {
      throw new Error(`insertOne: operation not available for collection '${collection}'.`);
    }
    return result;
  }

  async replaceOne(collection, ...args) {
    if (parseInt(`${process.env.DB_READONLY}`, 10) === 1) {
      logger.error(args, `replaceOne denied on collection ${collection}`);
      return false;
    }
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`replaceOne: no handler for collection '${collection}'.`);
    }
    let result = null;
    if (handler.isMongo === true) {
      args.push({
        bypassDocumentValidation: true,
      });
      result = await handler.collections[shortCollectionName].replaceOne.apply(
        handler.collections[shortCollectionName],
        args,
      );
    } else {
      throw new Error(`replaceOne: operation not available for collection '${collection}'.`);
    }
    return result;
  }

  async deleteOne(collection, ...args) {
    if (parseInt(`${process.env.DB_READONLY}`, 10) === 1) {
      logger.error(args, `deleteOne denied on collection ${collection}`);
      return false;
    }
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`deleteOne: no handler for collection '${collection}'.`);
    }
    let result = null;
    if (handler.isMongo === true) {
      result = await handler.collections[shortCollectionName].deleteOne.apply(
        handler.collections[shortCollectionName],
        args,
      );
    } else {
      throw new Error(`deleteOne: operation not available for collection '${collection}'.`);
    }
    return result;
  }

  async deleteMany(collection, ...args) {
    if (parseInt(`${process.env.DB_READONLY}`, 10) === 1) {
      logger.error(args, `deleteMany denied on collection ${collection}`);
      return false;
    }
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`deleteMany: no handler for collection '${collection}'.`);
    }
    let result = null;
    if (handler.isMongo === true) {
      result = await handler.collections[shortCollectionName].deleteMany.apply(
        handler.collections[shortCollectionName],
        args,
      );
    } else {
      throw new Error(`deleteMany: operation not available for collection '${collection}'.`);
    }
    return result;
  }

  async dropIndexes(collection, ...args) {
    if (parseInt(`${process.env.DB_READONLY}`, 10) === 1) {
      logger.error(args, `dropIndexes denied on collection ${collection}`);
      return false;
    }
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`dropIndexes: no handler for collection '${collection}'.`);
    }
    let result = null;
    if (handler.isMongo === true) {
      result = await handler.collections[shortCollectionName].dropIndexes.apply(
        handler.collections[shortCollectionName],
        args,
      );
    } else {
      throw new Error(`dropIndexes: operation not available for collection '${collection}'.`);
    }
    return result;
  }

  async createIndex(collection, ...args) {
    if (parseInt(`${process.env.DB_READONLY}`, 10) === 1) {
      logger.error(args, `createIndex denied on collection ${collection}`);
      return false;
    }
    await this.connect(collection);
    const handler = this.getHandler(collection);
    const shortCollectionName = collection.replace(/^\w+\./i, '');
    if (!handler.collections[shortCollectionName]) {
      throw new Error(`createIndex: no handler for collection '${collection}'.`);
    }
    let result = null;
    if (handler.isMongo === true) {
      result = await handler.collections[shortCollectionName].createIndex.apply(
        handler.collections[shortCollectionName],
        args,
      );
    } else {
      throw new Error(`createIndex: operation not available for collection '${collection}'.`);
    }
    return result;
  }

  retrieveObjectId(document) {
    Object.keys(document).forEach(function (key) {
      if (/id/i.test(key) && typeof document[key] === 'string' && ObjectId.isValid(document[key])) {
        document[key] = new ObjectId(`${document[key]}`);
      }
    });
    return document;
  }
}

exports.Database = new Database();
exports.ObjectId = ObjectId;
