const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const iconv = require('iconv-lite');
const oracledb = require('oracledb');

iconv.skipDecodeWarning = true;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Switch to "Thick Mode" (because Jurica uses an archaic version of Oracle, cf. https://node-oracledb.readthedocs.io/en/latest/user_guide/initialization.html#enabling-node-oracledb-thick-mode-on-linux-and-related-platforms):
// oracledb.initOracleClient();

class JuricaOracle {
  constructor() {
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
    } else {
      throw new Error('Jurica.connect: already connected.');
    }
  }

  async close() {
    if (this.connected === true && this.connection !== null) {
      await this.connection.close();
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
              data[key] = iconv.decode(data[key], process.env.ENCODING);
            }
            break;
        }
      }
      if (withExtraneous) {
        try {
          let html = data['JDEC_HTML_SOURCE'];
          html = html.replace(/<\/?[^>]+(>|$)/gm, '');
          if (html && html.indexOf('Portalis') !== -1) {
            // Strict :
            let portalis = /Portalis(?:\s+|\n+)(\b\S{4}-\S-\S{3}-(?:\s?|\n+)\S+\b)/g.exec(html);
            if (portalis === null) {
              // Less strict :
              portalis =
                /Portalis(?:\s*|\n*):?(?:\s+|\n+)(\b\S{2,4}(?:\s*)-(?:\s*)\S(?:\s*)-(?:\s*)\S{3}(?:\s*)-(?:\s*)(?:\s?|\n+)\S+\b)/g.exec(
                  html,
                );
              if (portalis === null) {
                // Even less strict :
                portalis =
                  /Portalis(?:\s*|\n*):?(?:\s+|\n+)(\b\S{2,4}(?:\s*)-(?:\s*)\S{3}(?:\s*)-(?:\s*)(?:\s?|\n+)\S+\b)/g.exec(
                    html,
                  );
              }
            }
            portalis = portalis[1].replace(/\s/g, '').trim();
            data['_portalis'] = portalis;
          } else {
            data['_portalis'] = null;
          }
        } catch (e) {
          data['_portalis'] = null;
        }

        try {
          // Inject "bloc_occultation" data (if any) into the document:
          let blocId = null;
          if (row.JDEC_CODNAC) {
            const NACquery = `SELECT *
              FROM JCA_NAC
              WHERE JCA_NAC.JNAC_F22CODE = :code`;
            const NACResult = await this.connection.execute(NACquery, [row.JDEC_CODNAC]);
            if (NACResult && NACResult.rows && NACResult.rows.length > 0) {
              const indexBloc = NACResult.rows[0].JNAC_IND_BLOC;
              if (indexBloc) {
                const { GRCOMOracle } = require('./grcom-oracle');
                const GRCOMSource = new GRCOMOracle();
                await GRCOMSource.connect();
                const GRCOMQuery = `SELECT *
                  FROM BLOCS_OCCULT_COMPL
                  WHERE BLOCS_OCCULT_COMPL.ID_BLOC = :code`;
                const GRCOMResult = await GRCOMSource.connection.execute(GRCOMQuery, [indexBloc]);
                if (GRCOMResult && GRCOMResult.rows && GRCOMResult.rows.length > 0) {
                  blocId = GRCOMResult.rows[0].ID_BLOC;
                  let occultations = await this.buildRawData(GRCOMResult.rows[0], false);
                  for (let key in occultations) {
                    if (key !== 'ID_BLOC' && data[key] === undefined) {
                      data[key] = occultations[key];
                    }
                  }
                }
                await GRCOMSource.close();
              }
            }
          }
          data['_bloc_occultation'] = blocId;
        } catch (e) {
          data['_bloc_occultation'] = null;
        }
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
  async getNew(monthAgo) {
    if (monthAgo === undefined) {
      monthAgo = 6;
    }
    if (this.connected === true && this.connection !== null) {
      // Source DBs are full of "holes" so we need to set a limit
      // (Sword used '2015-07-17' as date limit):
      let ago = new Date();
      ago.setMonth(ago.getMonth() - monthAgo);
      ago.setHours(0, 0, 0, 0);
      let strAgo = ago.getFullYear();
      strAgo = `${strAgo}${ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1}`;
      strAgo = `${strAgo}${ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate()}`;

      let query = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.JDEC_HTML_SOURCE IS NOT NULL
        AND ${process.env.DB_TABLE_JURICA}.${process.env.DB_ANO_TEXT_FIELD_JURICA} IS NULL
        AND ${process.env.DB_TABLE_JURICA}.${process.env.DB_STATE_FIELD_JURICA} = 0
        AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE_CREATION >= ${strAgo}
        ORDER BY ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} DESC`;

      query = `SELECT * FROM (
        SELECT a.*, ROWNUM rnum FROM (
          ${query}
        ) a WHERE rownum <= 250
      ) WHERE rnum >= 0`;

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

  async getFaulty() {
    if (this.connected === true && this.connection !== null) {
      const query = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.JDEC_HTML_SOURCE IS NOT NULL
        AND ${process.env.DB_TABLE_JURICA}.${process.env.DB_STATE_FIELD_JURICA} = 4
        ORDER BY ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} DESC`;

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
      throw new Error('Jurica.getFaulty: not connected.');
    }
  }

  /**
   * Get all decisions from Jurica that have been modified since the given date.
   *
   * @returns {Array} An array of documents (with UTF-8 encoded content)
   */
  async getModifiedSince(date) {
    if (this.connected === true && this.connection !== null) {
      let strDate = date.getFullYear();
      strDate += '-' + (date.getMonth() + 1 < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1);
      strDate += '-' + (date.getDate() < 10 ? '0' + date.getDate() : date.getDate());

      const query = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.JDEC_HTML_SOURCE IS NOT NULL
        AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE_MAJ > '${strDate}'
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
      throw new Error('Jurica.getModifiedSince: not connected.');
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
      strAgo = `${strAgo}${ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1}`;
      strAgo = `${strAgo}${ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate()}`;
      
      const query = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.JDEC_HTML_SOURCE IS NOT NULL
        AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE_CREATION >= ${strAgo}
        ORDER BY ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} ASC`;
      //         AND ${process.env.DB_TABLE_JURICA}.JDEC_IND_DEC_PUB IS NOT NULL

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
   * Get a batch of decisions from Jurica using offset/limit/order.
   *
   * @returns {Array} An array of documents (with UTF-8 encoded content)
   */
  async getBatch(opt) {
    opt = opt || {};
    opt.offset = opt.offset || 0;
    opt.limit = opt.limit || 0;
    opt.order = opt.order || 'ASC';
    opt.onlyTreated = opt.onlyTreated || false;

    if (this.connected === true && this.connection !== null) {
      let query;

      if (!opt.onlyTreated) {
        query = `SELECT *
          FROM ${process.env.DB_TABLE_JURICA}
          WHERE ${process.env.DB_TABLE_JURICA}.JDEC_HTML_SOURCE IS NOT NULL
          ORDER BY ${process.env.DB_ID_FIELD_JURICA} ${opt.order}`;
      } else {
        query = `SELECT *
          FROM ${process.env.DB_TABLE_JURICA}
          WHERE ${process.env.DB_TABLE_JURICA}.JDEC_HTML_SOURCE IS NOT NULL
          AND ${process.env.DB_TABLE_JURICA}.${process.env.DB_STATE_FIELD_JURICA} = 2
          ORDER BY ${process.env.DB_ID_FIELD_JURICA} ${opt.order}`;
      }

      // LIMIT-like query for old versions of Oracle:
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
      throw new Error('Jurica.getBatch: not connected.');
    }
  }

  /**
   * Method to "reinject" into Jurica.
   * The pseudonimized text cannot be reinjected, so we only change the document status.
   *
   * @param {*} decision
   * @returns
   * @throws
   */
  async reinject(decision) {
    // We don't check the value of labelStatus or some other Label properties
    // because we may need to force the reinjection of the given decision
    // independently of its status within the Label workflow,
    // so the only required properties are sourceId and pseudoText:
    if (!decision || !decision.sourceId || !decision.pseudoText || decision.sourceName !== 'jurica') {
      throw new Error('Jurica.reinject: invalid decision to reinject.');
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the original decision from Jurica:
      const readQuery = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} = :id`;
      const readResult = await this.connection.execute(readQuery, [decision.sourceId]);
      if (readResult && readResult.rows && readResult.rows.length > 0) {
        const now = new Date();

        let dateForIndexing = now.getFullYear() + '-';
        dateForIndexing += (now.getMonth() < 9 ? '0' + (now.getMonth() + 1) : now.getMonth() + 1) + '-';
        dateForIndexing += now.getDate() < 10 ? '0' + now.getDate() : now.getDate();

        // 2. Update query:
        const updateQuery = `UPDATE ${process.env.DB_TABLE_JURICA}
            SET ${process.env.DB_STATE_FIELD_JURICA}=:ok,
            AUT_ANO=:label,
            DT_ANO=:datea,
            JDEC_DATE_MAJ=:dateb,
            DT_MODIF_ANO=:datec,
            DT_ENVOI_ABONNES=NULL
            WHERE ${process.env.DB_ID_FIELD_JURICA}=:id`;

        await this.connection.execute(
          updateQuery,
          [parseInt(process.env.DB_STATE_OK_JURICA), 'LABEL', now, dateForIndexing, now, decision.sourceId],
          { autoCommit: true },
        );
        return true;
      } else {
        throw new Error(`Jurica.reinject: pending decision '${decision.sourceId}' not found.`);
      }
    } else {
      throw new Error('Jurica.reinject: not connected.');
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
        WHERE  ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} = :id`;
      const readResult = await this.connection.execute(readQuery, [id]);
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
   * Method to mark a Jurica document as being erroneous.
   *
   * @param {*} id
   * @returns
   * @throws
   */
  async markAsErroneous(id) {
    if (!id) {
      throw new Error(`Jurica.markAsErroneous: invalid ID '${id}'.`);
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the original decision from Jurica:
      const readQuery = `SELECT *
        FROM ${process.env.DB_TABLE_JURICA}
        WHERE  ${process.env.DB_TABLE_JURICA}.${process.env.DB_ID_FIELD_JURICA} = :id`;
      const readResult = await this.connection.execute(readQuery, [id]);
      if (readResult && readResult.rows && readResult.rows.length > 0) {
        // 2. Update query:
        const updateQuery = `UPDATE ${process.env.DB_TABLE_JURICA}
          SET ${process.env.DB_STATE_FIELD_JURICA}=:error
          WHERE ${process.env.DB_ID_FIELD_JURICA}=:id`;
        await this.connection.execute(updateQuery, [4, id], { autoCommit: true });
        return true;
      } else {
        throw new Error(`Jurica.markAsErroneous: original decision '${id}' not found.`);
      }
    } else {
      throw new Error('Jurica.markAsErroneous: not connected.');
    }
  }

  /**
   * Method to retrieve a decision using the "decatt" info.
   * e.g:
   * {
   *   NUM_RG: '17/20421',
   *   DT_DECATT: 2019-02-13T22:00:00.000Z,
   * }
   * @param {object} info
   * @returns
   * @throws
   */
  async getDecisionIdByDecattInfo(infos) {
    let results = [];
    if (!Array.isArray(infos)) {
      infos = [infos];
    }
    for (let ii = 0; ii < infos.length; ii++) {
      let info = infos[ii];
      if (!info || !info['NUM_RG'] || !info['DT_DECATT']) {
        // console.error('Jurica.getDecisionIdByDecattInfo - invalid "decatt" info:\n' + JSON.stringify(info, null, 2));
      } else if (this.connected === true && this.connection !== null) {
        let decattDate = new Date(Date.parse(info['DT_DECATT']));
        decattDate.setHours(decattDate.getHours() + 2);
        let strDecatt = decattDate.getFullYear();
        strDecatt +=
          '-' + (decattDate.getMonth() + 1 < 10 ? '0' + (decattDate.getMonth() + 1) : decattDate.getMonth() + 1);
        strDecatt += '-' + (decattDate.getDate() < 10 ? '0' + decattDate.getDate() : decattDate.getDate());

        let RGTerms = ['', ''];
        try {
          RGTerms = `${info.NUM_RG}`.split('/');
          RGTerms[0] = RGTerms[0].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
          RGTerms[1] = RGTerms[1].replace(/\D/gm, '').replace(/^0+/gm, '').trim();
        } catch (ignore) {}
        const decisionQuery = `SELECT *
          FROM ${process.env.DB_TABLE_JURICA}
          WHERE REGEXP_LIKE(${process.env.DB_TABLE_JURICA}.JDEC_NUM_RG, '^0*${RGTerms[0]}/0*${RGTerms[1]} *$')
          AND ${process.env.DB_TABLE_JURICA}.JDEC_DATE = '${strDecatt}'`;

        const decisionResult = await this.connection.execute(decisionQuery, []);

        if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
          for (let i = 0; i < decisionResult.rows.length; i++) {
            results.push(decisionResult.rows[i]['JDEC_ID']);
          }
        } else {
          /*
          console.error(
            'Jurica.getDecisionIdByDecattInfo - no decision related to the given "decatt" info:\n' +
              JSON.stringify(info, null, 2),
          );
          */
        }
      } else {
        throw new Error('Jurica.getDecisionIdByDecattInfo: not connected.');
      }
    }

    return results.filter((value, index, self) => {
      return self.indexOf(value) === index;
    });
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
