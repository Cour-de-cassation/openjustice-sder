const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const iconv = require('iconv-lite');
const oracledb = require('oracledb');

iconv.skipDecodeWarning = true;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

class JuricaOracle {
  constructor(opt) {
    opt = opt || {};
    this.verbose = opt.verbose || false;
    this.connected = false;
    this.connection = null;
  }

  async connect() {
    if (this.connected === false) {
      this.connection = await oracledb.getConnection({
        user: process.env.DB_USER_JURICA,
        password: process.env.DB_PASS_JURICA,
        connectString: process.env.DB_HOST_JURICA,
      });
      this.connected = true;
      if (this.verbose === true) {
        console.info(`Jurica.connect: connected to Oracle v${this.connection.oracleServerVersionString}.`);
      }
    } else {
      throw new Error('Jurica.connect: already connected.');
    }
  }

  async close() {
    if (this.connected === true && this.connection !== null) {
      await this.connection.close();
      if (this.verbose === true) {
        console.info('Jurica.close: disconnected from Oracle.');
      }
    } else {
      throw new Error('Jurica.close: not connected.');
    }
  }

  async describe() {
    if (this.connected === true && this.connection !== null) {
      // DESCRIBE-like query for an old version of Oracle:
      const query = `SELECT *
        FROM user_tab_columns
        WHERE table_name = '${process.env.DB_TABLE_JURICA}'
        ORDER BY column_id`;
      return await this.connection.execute(query);
    } else {
      throw new Error('Jurica.describe: not connected.');
    }
  }

  /**
   * Get new decisions from Jurica.
   *
   * New decisions are documents that have:
   *  - No pseudonymized text (HTMLA = NULL)
   *  - No pseudonymized task in progress (IND_ANO = 0)
   *
   * @returns {Array} An array of documents (with UTF-8 encoded content)
   */
  async getNew() {
    if (this.connected === true && this.connection !== null) {
      // Source DBs are full of "holes" so we need to set a limit:
      let ago = new Date();
      ago.setMonth(ago.getMonth() - 1);
      ago.setHours(0, 0, 0, 0);
      let strAgo = ago.getFullYear();
      strAgo += '-' + (ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1);
      strAgo += '-' + (ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate());
      // Sword uses '2015-07-17' as date limit
      const query = `SELECT * 
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.${process.env.DB_ANO_TEXT_FIELD_JURICA} IS NULL
        AND ${process.env.DB_TABLE_JURICA}.${process.env.DB_STATE_FIELD_JURICA} = 0
        AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE_CREATION >= '${strAgo}'
        ORDER BY ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} ASC`;
      const result = await this.connection.execute(query);
      if (result && result.rows && result.rows.length > 0) {
        let rows = [];
        for (let i = 0; i < result.rows.length; i++) {
          let row = {};
          for (let key in result.rows[i]) {
            switch (key) {
              case process.env.DB_ID_FIELD_JURICA:
                row[process.env.MONGO_ID] = result.rows[i][key];
                break;
              default:
                try {
                  if (typeof result.rows[i][key].getData === 'function') {
                    row[key] = await result.rows[i][key].getData();
                  } else {
                    row[key] = result.rows[i][key];
                  }
                  row[key] = iconv.decode(row[key], process.env.ENCODING);
                } catch (ignore) {}
                break;
            }
          }
          rows.push(row);
        }
        return rows;
      } else {
        return null;
      }
    } else {
      throw new Error('Jurica.getNew: not connected.');
    }
  }

  // @DEPRECATED
  async getBatch(opt) {
    opt = opt || {};
    opt.all = opt.all || false;
    opt.limit = opt.limit || 0;
    opt.offset = opt.offset || 0;
    opt.order = opt.order || 'ASC';
    opt.titrage = opt.titrage || false;

    if (this.connected === true && this.connection !== null) {
      let query = null;

      if (opt.all === true) {
        // Get all documents:
        query = `SELECT * 
          FROM ${process.env.DB_TABLE_JURICA}
          ORDER BY ${process.env.DB_ID_FIELD_JURICA} ${opt.order}`;
      } else {
        // Only get the documents that are ready to be published:
        query = `SELECT * 
          FROM ${process.env.DB_TABLE_JURICA}
          WHERE ${process.env.DB_ANO_TEXT_FIELD_JURICA} is not NULL
          AND ${process.env.DB_VALID_FIELD_JURICA} is not NULL
          AND ${process.env.DB_STATE_FIELD_JURICA} = :ok
          ORDER BY ${process.env.DB_ID_FIELD_JURICA} ${opt.order}`;
      }

      // LIMIT-like query for an old version of Oracle:
      if (opt.limit || opt.offset) {
        if (opt.offset > 0) {
          opt.limit += opt.offset;
          opt.offset++;
        }
        query = `SELECT * FROM (
          SELECT a.*, ROWNUM rnum FROM (
            ${query}
          ) a WHERE rownum <= ${opt.limit}
        ) WHERE rnum >= ${opt.offset}`;
      }

      let result = null;

      if (opt.all === true) {
        result = await this.connection.execute(query);
      } else {
        result = await this.connection.execute(query, [process.env.DB_STATE_OK_JURICA]);
      }

      if (result && result.rows && result.rows.length > 0) {
        let rows = [];
        for (let i = 0; i < result.rows.length; i++) {
          let row = {};
          for (let key in result.rows[i]) {
            switch (key) {
              case process.env.DB_ID_FIELD_JURICA:
                row[process.env.MONGO_ID] = result.rows[i][key];
                break;
              case 'RNUM':
                // Ignore RNUM key (added by offset/limit query)
                break;
              default:
                try {
                  if (typeof result.rows[i][key].getData === 'function') {
                    row[key] = await result.rows[i][key].getData();
                  } else {
                    row[key] = result.rows[i][key];
                  }
                  row[key] = iconv.decode(row[key], process.env.ENCODING);
                } catch (ignore) {}
                break;
            }
          }
          if (opt.titrage === true) {
            // @TODO?
          }
          rows.push(row);
        }
        return rows;
      } else {
        return null;
      }
    } else {
      throw new Error('Not connected.');
    }
  }

  /**
   * Method to mark a Jurica document as being imported for Label.
   *
   * @param {*} id
   * @returns
   * @throws
   */
  async markAsImported(id) {
    if (!id) {
      throw new Error(`Jurica.markAsImported: invalid ID '${id}'.`);
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the original decision from Jurica:
      const readQuery = `SELECT * 
          FROM ${process.env.DB_TABLE_JURICA}
          WHERE  ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} = :id
          AND  ${process.env.DB_TABLE_JURICA}.${process.env.DB_STATE_FIELD_JURICA} = :none`;
      console.log('Jurica.markAsImported - readQuery:', readQuery, id, 0);
      const readResult = await this.connection.execute(readQuery, [id, 0]);
      if (readResult && readResult.rows && readResult.rows.length > 0) {
        // 2. Update query:
        const updateQuery = `UPDATE ${process.env.DB_TABLE_JURICA}
            SET  ${process.env.DB_TABLE_JURICA}.${process.env.DB_STATE_FIELD_JURICA} = :pending,
            WHERE  ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} = :id`;
        console.log('Jurica.markAsImported - updateQuery:', updateQuery, 1, id);
        await this.connection.execute(updateQuery, [1, id], { autoCommit: true });
        return true;
      } else {
        throw new Error(`Jurica.markAsImported: original decision '${id}' not found.`);
      }
    } else {
      throw new Error('Jurica.markAsImported: not connected.');
    }
  }

  /**
   * Method to retrieve a decision by its RG number.
   *
   * @param {string} rgNumber
   * @returns
   * @throws
   */
  async getDecisionByRG(rgNumber) {
    if (!rgNumber || typeof rgNumber !== 'string') {
      throw new Error(`Jurica.getDecisionByRG: invalid RG number '${rgNumber}'.`);
    } else if (this.connected === true && this.connection !== null) {
      const decisionQuery = `SELECT * 
          FROM ${process.env.DB_TABLE_JURICA}
          WHERE ${process.env.DB_TABLE_JURICA}.JDEC_NUM_RG = :rgNumber`;
      const decisionResult = await this.connection.execute(decisionQuery, [rgNumber]);
      if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
        return decisionResult.rows[0];
      } else {
        throw new Error(`Jurica.getDecisionByRG: decision with RG number '${rgNumber}' not found.`);
      }
    } else {
      throw new Error('Jurica.getDecisionByRG: not connected.');
    }
  }
}

exports.JuricaOracle = JuricaOracle;
