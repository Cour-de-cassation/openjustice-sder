require('dotenv').config();

const iconv = require('iconv-lite');
const oracledb = require('oracledb');

iconv.skipDecodeWarning = true;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// @TODO opt.parties

class JurinetOracle {
  constructor(opt) {
    opt = opt || {};
    this.verbose = opt.verbose || false;
    this.connected = false;
    this.connection = null;
  }

  async connect() {
    if (this.connected === false) {
      this.connection = await oracledb.getConnection({
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        connectString: process.env.DB_HOST,
      });
      this.connected = true;
      if (this.verbose === true) {
        console.info(`Jurinet - Connected to Oracle v${this.connection.oracleServerVersionString}.`);
      }
    } else {
      throw new Error('Jurinet - Already connected.');
    }
  }

  async close() {
    if (this.connected === true && this.connection !== null) {
      await this.connection.close();
      if (this.verbose === true) {
        console.info('Jurinet - Disconnected from Oracle.');
      }
    } else {
      throw new Error('Jurinet - Not connected.');
    }
  }

  async describe() {
    if (this.connected === true && this.connection !== null) {
      // DESCRIBE-like query for an old version of Oracle:
      const query = `SELECT *
        FROM user_tab_columns
        WHERE table_name = '${process.env.DB_TABLE}'
        ORDER BY column_id`;
      return await this.connection.execute(query);
    } else {
      throw new Error('Jurinet - Not connected.');
    }
  }

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
          FROM ${process.env.DB_TABLE}
          ORDER BY ${process.env.DB_ID_FIELD} ${opt.order}`;
      } else {
        // Only get the documents that are ready to be published:
        query = `SELECT * 
          FROM ${process.env.DB_TABLE}
          WHERE ${process.env.DB_ANO_TEXT_FIELD} is not NULL
          AND ${process.env.DB_VALID_FIELD} is not NULL
          AND ${process.env.DB_STATE_FIELD} = :ok
          ORDER BY ${process.env.DB_ID_FIELD} ${opt.order}`;
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
        result = await this.connection.execute(query, [process.env.DB_STATE_OK]);
      }

      if (result && result.rows && result.rows.length > 0) {
        let rows = [];
        for (let i = 0; i < result.rows.length; i++) {
          let row = {};
          for (let key in result.rows[i]) {
            switch (key) {
              case process.env.DB_ID_FIELD:
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
            // Inject "titrage" data (if any) into the result:
            const queryTitrage = `SELECT * 
                FROM ${process.env.DB_TITRAGE_TABLE}
                WHERE ${process.env.DB_ID_FIELD} = :id`;
            const resultTitrage = await this.connection.execute(queryTitrage, [
              result.rows[i][process.env.DB_ID_FIELD],
            ]);
            if (resultTitrage && resultTitrage.rows && resultTitrage.rows.length > 0) {
              row[process.env.TITRAGE_FIELD] = [];
              for (let j = 0; j < resultTitrage.rows.length; j++) {
                let titrageObj = {};
                for (let key in resultTitrage.rows[j]) {
                  titrageObj[key] = resultTitrage.rows[j][key];
                  try {
                    titrageObj[key] = iconv.decode(titrageObj[key], process.env.ENCODING);
                  } catch (ignore) {}
                }
                row[process.env.TITRAGE_FIELD].push(titrageObj);
              }
            } else {
              row[process.env.TITRAGE_FIELD] = null;
            }
          }
          rows.push(row);
        }
        return rows;
      } else {
        return null;
      }
    } else {
      throw new Error('Jurinet - Not connected.');
    }
  }
}

exports.JurinetOracle = JurinetOracle;
