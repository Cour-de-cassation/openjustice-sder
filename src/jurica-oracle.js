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
      console.log(
        `Connecting to ${process.env.DB_HOST_JURICA} (${process.env.DB_USER_JURICA}/${process.env.DB_PASS_JURICA})...`,
      );
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

  async buildRawData(row, withExtraneous) {
    if (this.connected === true && this.connection !== null) {
      let data = {};
      for (let key in row) {
        switch (key) {
          case process.env.DB_ID_FIELD_JURICA:
            data[process.env.MONGO_ID] = row[key];
            break;
          default:
            try {
              if (typeof row[key].getData === 'function') {
                data[key] = await row[key].getData();
              } else {
                data[key] = row[key];
              }
              data[key] = iconv.decode(data[key], process.env.ENCODING);
            } catch (ignore) {}
            break;
        }
      }
      if (withExtraneous) {
        // @TODO
      }
      return data;
    } else {
      throw new Error('Jurica.buildRawData: not connected.');
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
      // Source DBs are full of "holes" so we need to set a limit
      // (Sword used '2015-07-17' as date limit):
      let ago = new Date();
      ago.setMonth(ago.getMonth() - 1);
      ago.setHours(0, 0, 0, 0);
      let strAgo = ago.getFullYear();
      strAgo += '-' + (ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1);
      strAgo += '-' + (ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate());

      const query = `SELECT * 
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.${process.env.DB_ANO_TEXT_FIELD_JURICA} IS NULL
        AND ${process.env.DB_TABLE_JURICA}.${process.env.DB_STATE_FIELD_JURICA} = 0
        AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE_CREATION >= '${strAgo}'
        ORDER BY ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} ASC`;

      const result = await this.connection.execute(query, [], {
        resultSet: true,
      });

      const rs = result.resultSet;
      let rows = [];
      let resultRow;

      while ((resultRow = await rs.getRow())) {
        const data = await this.buildRawData(resultRow, true);
        rows.push(data);
      }

      await rs.close();

      if (rows.length > 0) {
        return rows;
      } else {
        return null;
      }
    } else {
      throw new Error('Jurica.getNew: not connected.');
    }
  }

  /**
   * Get all decisions from Jurica from the last N months.
   *
   * @returns {Array} An array of documents (with UTF-8 encoded content)
   */
  async getLastNMonth(NMonth) {
    if (this.connected === true && this.connection !== null) {
      let ago = new Date();
      ago.setMonth(ago.getMonth() - NMonth);
      ago.setHours(0, 0, 0, 0);
      let strAgo = ago.getFullYear();
      strAgo += '-' + (ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1);
      strAgo += '-' + (ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate());

      const query = `SELECT * 
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.JDEC_DATE_CREATION >= '${strAgo}'
        ORDER BY ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} ASC`;

      const result = await this.connection.execute(query, [], {
        resultSet: true,
      });

      const rs = result.resultSet;
      let rows = [];
      let resultRow;

      while ((resultRow = await rs.getRow())) {
        const data = await this.buildRawData(resultRow, true);
        rows.push(data);
      }

      await rs.close();

      if (rows.length > 0) {
        return rows;
      } else {
        return null;
      }
    } else {
      throw new Error('Jurica.getLastNMonth: not connected.');
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

      const readResult = await this.connection.execute(readQuery, [id, 0]);

      if (readResult && readResult.rows && readResult.rows.length > 0) {
        // 2. Update query:
        const updateQuery = `UPDATE ${process.env.DB_TABLE_JURICA}
          SET ${process.env.DB_STATE_FIELD_JURICA}=:pending
          WHERE ${process.env.DB_ID_FIELD_JURICA}=:id`;

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
   * Method to retrieve a decision using the "decatt" info.
   * e.g:
   * {
   *   NUM_RG: '17/20421',
   *   DT_DECATT: 2019-02-13T22:00:00.000Z,
   *   FORMATION_DECATT: 'pôle 2, chambre 2',
   * }
   * @param {object} info
   * @returns
   * @throws
   */
  async getDecisionIdByDecattInfo(info) {
    if (!info || !info['NUM_RG'] || !info['DT_DECATT'] || !info['FORMATION_DECATT']) {
      throw new Error('Jurica.getDecisionIdByDecattInfo - invalid "decatt" info:\n' + JSON.stringify(info, null, 2));
    } else if (this.connected === true && this.connection !== null) {
      let decattDate1 = new Date(Date.parse(info['DT_DECATT']));
      decattDate1.setDate(decattDate1.getDate() - 1);
      let strDecatt1 = decattDate1.getFullYear();
      strDecatt1 +=
        '-' + (decattDate1.getMonth() + 1 < 10 ? '0' + (decattDate1.getMonth() + 1) : decattDate1.getMonth() + 1);
      strDecatt1 += '-' + (decattDate1.getDate() < 10 ? '0' + decattDate1.getDate() : decattDate1.getDate());

      let decattDate2 = new Date(Date.parse(info['DT_DECATT']));
      decattDate2.setDate(decattDate2.getDate() + 1);
      let strDecatt2 = decattDate2.getFullYear();
      strDecatt2 +=
        '-' + (decattDate2.getMonth() + 1 < 10 ? '0' + (decattDate2.getMonth() + 1) : decattDate2.getMonth() + 1);
      strDecatt2 += '-' + (decattDate2.getDate() < 10 ? '0' + decattDate2.getDate() : decattDate2.getDate());

      const decisionQuery = `SELECT * 
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.JDEC_NUM_RG = :rgNumber
        AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE >= '${strDecatt1}'
        AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE <= '${strDecatt2}'`;

      const decisionResult = await this.connection.execute(decisionQuery, [info['NUM_RG']]);

      if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
        let result = [];
        for (let i = 0; i < decisionResult.rows.length; i++) {
          if (decisionResult.rows.length >= 1) {
            try {
              let actualFormation = decisionResult.rows[i]['JDEC_LIB_AUTORITE']
                .replace(/[^a-z0-9]/gim, '')
                .trim()
                .toLowerCase();
              let decattFormation = info['FORMATION_DECATT']
                .replace(/[^a-z0-9]/gim, '')
                .trim()
                .toLowerCase();
              if (actualFormation === decattFormation) {
                result.push(decisionResult.rows[i]['JDEC_ID']);
              }
            } catch (e) {
              result.push(decisionResult.rows[i]['JDEC_ID']);
            }
          } else {
            result.push(decisionResult.rows[i]['JDEC_ID']);
          }
        }
        return result;
      } else {
        throw new Error(
          'Jurica.getDecisionIdByDecattInfo - no decision related to the given "decatt" info:\n' +
            JSON.stringify(info, null, 2),
        );
      }
    } else {
      throw new Error('Jurica.getDecisionIdByDecattInfo: not connected.');
    }
  }

  /**
   * Method to retrieve a decision by its ID.
   *
   * @param {*} id
   * @returns
   * @throws
   */
  async getDecisionByID(id) {
    if (!id) {
      throw new Error(`Jurica.getDecisionByID: invalid ID '${id}'.`);
    } else if (this.connected === true && this.connection !== null) {
      const decisionQuery = `SELECT * 
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} = :id`;

      const decisionResult = await this.connection.execute(decisionQuery, [id]);
      if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
        return await this.buildRawData(decisionResult.rows[0], true);
      } else {
        throw new Error(`Jurica.getDecisionByID: decision with ID '${id}' not found.`);
      }
    } else {
      throw new Error('Jurica.getDecisionByID: not connected.');
    }
  }
}

exports.JuricaOracle = JuricaOracle;
