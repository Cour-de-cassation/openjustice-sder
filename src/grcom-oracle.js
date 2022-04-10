const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const iconv = require('iconv-lite');
const oracledb = require('oracledb');

iconv.skipDecodeWarning = true;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

class GRCOMOracle {
  constructor() {
    this.connected = false;
    this.connection = null;
  }

  async connect() {
    if (this.connected === false) {
      this.connection = await oracledb.getConnection({
        user: process.env.GRCOM_DB_USER,
        password: process.env.GRCOM_DB_PASS,
        connectString: process.env.DB_HOST,
      });
      this.connected = true;
    } else {
      throw new Error('GRCOMOracle.connect: already connected.');
    }
  }

  async close() {
    if (this.connected === true && this.connection !== null) {
      await this.connection.close();
    } else {
      throw new Error('GRCOMOracle.close: not connected.');
    }
  }

  async describe(table) {
    if (this.connected === true && this.connection !== null) {
      // DESCRIBE-like query for an old version of Oracle:
      const query = `SELECT *
        FROM user_tab_columns
        WHERE table_name = :table
        ORDER BY column_id`;
      return await this.connection.execute(query, [table]);
    } else {
      throw new Error('GRCOMOracle.describe: not connected.');
    }
  }

  async buildRawData(row) {
    if (this.connected === true && this.connection !== null) {
      let data = {};
      for (let key in row) {
        switch (key) {
          case 'rnum':
            // Ignore rnum key (added by offset/limit queries)
            break;
          case 'RNUM':
            // Ignore RNUM key (added by offset/limit queries)
            break;
          default:
            if (row[key] && typeof row[key].getData === 'function') {
              try {
                data[key] = await row[key].getData();
              } catch (e) {
                data[key] = null;
              }
            } else {
              data[key] = row[key];
            }
            if (Buffer.isBuffer(data[key])) {
              data[key] = iconv.decode(data[key], 'CP1252');
            }
            break;
        }
      }
      return data;
    } else {
      throw new Error('GRCOMOracle.buildRawData: not connected.');
    }
  }
}

exports.GRCOMOracle = GRCOMOracle;
