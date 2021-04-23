const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const iconv = require('iconv-lite');
const oracledb = require('oracledb');

iconv.skipDecodeWarning = true;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

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
        console.info(`Jurinet.connect: connected to Oracle v${this.connection.oracleServerVersionString}.`);
      }
    } else {
      throw new Error('Jurinet.connect: already connected.');
    }
  }

  async close() {
    if (this.connected === true && this.connection !== null) {
      await this.connection.close();
      if (this.verbose === true) {
        console.info('Jurinet.close: disconnected from Oracle.');
      }
    } else {
      throw new Error('Jurinet.close: not connected.');
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
      throw new Error('Jurinet.describe: not connected.');
    }
  }

  async buildRawData(row, withExtraneous) {
    if (this.connected === true && this.connection !== null) {
      let data = {};
      for (let key in row) {
        switch (key) {
          case process.env.DB_ID_FIELD:
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
        try {
          // Inject "titrage" data (if any) into the document:
          const queryTitrage = `SELECT * 
            FROM TITREREFERENCE
            WHERE ${process.env.DB_ID_FIELD} = :id`;
          const resultTitrage = await this.connection.execute(queryTitrage, [row[process.env.DB_ID_FIELD]]);
          if (resultTitrage && resultTitrage.rows && resultTitrage.rows.length > 0) {
            data['_titrage'] = [];
            for (let j = 0; j < resultTitrage.rows.length; j++) {
              const titrageObj = await this.buildRawData(resultTitrage.rows[j], false);
              data['_titrage'].push(titrageObj);
            }
          } else {
            data['_titrage'] = null;
          }
        } catch (e) {
          data['_titrage'] = null;
        }

        try {
          // Inject "analyse" data (if any) into the document:
          const queryAnalyse = `SELECT * 
            FROM ANALYSE
            WHERE ${process.env.DB_ID_FIELD} = :id`;
          const resultAnalyse = await this.connection.execute(queryAnalyse, [row[process.env.DB_ID_FIELD]]);
          if (resultAnalyse && resultAnalyse.rows && resultAnalyse.rows.length > 0) {
            data['_analyse'] = [];
            for (let j = 0; j < resultAnalyse.rows.length; j++) {
              const analyseObj = await this.buildRawData(resultAnalyse.rows[j], false);
              data['_analyse'].push(analyseObj);
            }
          } else {
            data['_analyse'] = null;
          }
        } catch (e) {
          data['_analyse'] = null;
        }

        try {
          // Inject "partie" data (if any) into the document:
          const queryPartie = `SELECT * 
            FROM VIEW_PARTIE
            WHERE ${process.env.DB_ID_FIELD} = :id`;
          const resultPartie = await this.connection.execute(queryPartie, [row[process.env.DB_ID_FIELD]]);
          if (resultPartie && resultPartie.rows && resultPartie.rows.length > 0) {
            data['_partie'] = [];
            for (let j = 0; j < resultPartie.rows.length; j++) {
              const partieObj = await this.buildRawData(resultPartie.rows[j], false);
              data['_partie'].push(partieObj);
            }
          } else {
            data['_partie'] = null;
          }
        } catch (e) {
          data['_partie'] = null;
        }

        try {
          // Inject "decatt" data (if any) into the document:
          const { JuricaOracle } = require('../jurica-oracle');
          const juricaSource = new JuricaOracle({
            verbose: false,
          });
          await juricaSource.connect();
          const decattInfo = await this.getDecatt(row[process.env.DB_ID_FIELD]);
          const decatt = await juricaSource.getDecisionIdByDecattInfo(decattInfo);
          await juricaSource.close();
          data['_decatt'] = decatt;
        } catch (e) {
          data['_decatt'] = null;
        }
      }
      return data;
    } else {
      throw new Error('Jurinet.buildRawData: not connected.');
    }
  }

  /**
   * Get new decisions from Jurinet.
   *
   * New decisions are documents that have:
   *  - No pseudonymized text (XMLA = NULL)
   *  - No pseudonymized task in progress (IND_ANO = 0)
   *
   * @returns {Array} An array of documents (with UTF-8 encoded content)
   */
  async getNew() {
    if (this.connected === true && this.connection !== null) {
      // Source DBs are full of "holes" so we need to set a limit
      // (Sword used '01/06/2016' as date limit):
      let ago = new Date();
      ago.setMonth(ago.getMonth() - 1);
      ago.setHours(0, 0, 0, 0);
      let strAgo = ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate();
      strAgo += '/' + (ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1);
      strAgo += '/' + ago.getFullYear();

      const query = `SELECT * 
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.${process.env.DB_ANO_TEXT_FIELD} IS NULL
        AND ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = 0
        AND ${process.env.DB_TABLE}.DT_CREATION >= TO_DATE('${strAgo}', 'DD/MM/YYYY')
        ORDER BY ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} ASC`;

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
      throw new Error('Jurinet.getNew: not connected.');
    }
  }

  /**
   * Get all decisions from Jurinet from the last N months.
   *
   * @returns {Array} An array of documents (with UTF-8 encoded content)
   */
  async getLastNMonth(NMonth) {
    if (this.connected === true && this.connection !== null) {
      let ago = new Date();
      ago.setMonth(ago.getMonth() - NMonth);
      ago.setHours(0, 0, 0, 0);
      let strAgo = ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate();
      strAgo += '/' + (ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1);
      strAgo += '/' + ago.getFullYear();

      const query = `SELECT * 
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.DT_CREATION >= TO_DATE('${strAgo}', 'DD/MM/YYYY')
        ORDER BY ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} ASC`;

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
      throw new Error('Jurinet.getLastNMonth: not connected.');
    }
  }

  /**
   * Method to reinject the pseudonymized text of the given decision
   * into the XMLA field of its original Jurinet document.
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
    if (!decision || !decision.sourceId || !decision.pseudoText) {
      throw new Error('Jurinet.reinject: invalid decision to reinject.');
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the original decision from Jurinet:
      const readQuery = `SELECT * 
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id`;
      //  AND ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = :pending`;
      const readResult = await this.connection.execute(readQuery, [decision.sourceId]); // , 1]);
      if (readResult && readResult.rows && readResult.rows.length > 0) {
        // 2. Get the content of the original XML field to create the new XMLA field:
        let xmla = await readResult.rows[0]['XML'].getData();

        // 3. Decode the XML content from CP1252 to UTF-8 then remove its <TEXTE_ARRET> tag:
        xmla = iconv.decode(xmla, process.env.ENCODING);
        xmla = xmla.replace(/<texte_arret>[\s\S]*<\/texte_arret>/gim, '');

        if (xmla.indexOf('</DOCUMENT>') !== -1) {
          // 4. Reinject the <TEXTE_ARRET> tag but with the pseudonymized content,
          // then encode it back to CP1252 (required by the DILA export script):
          xmla = xmla.replace('</DOCUMENT>', '<TEXTE_ARRET>' + decision.pseudoText + '</TEXTE_ARRET></DOCUMENT>');
          xmla = iconv.encode(xmla, process.env.ENCODING);

          // 5. Set the date:
          const now = new Date();

          // 6. Update query (which, contrary to the doc, requires xmla to be passed as a String):
          const updateQuery = `UPDATE ${process.env.DB_TABLE}
            SET ${process.env.DB_ANO_TEXT_FIELD}=:xmla,
            ${process.env.DB_STATE_FIELD}=:ok,
            AUT_ANO=:label,
            DT_ANO=:datea,
            DT_MODIF_ANO=:dateb,
            DT_ENVOI_DILA=NULL
            WHERE ${process.env.DB_ID_FIELD}=:id`;
          await this.connection.execute(
            updateQuery,
            [xmla.toString(), parseInt(process.env.DB_STATE_OK), 'LABEL', now, now, decision.sourceId],
            { autoCommit: true },
          );
          return true;
        } else {
          throw new Error(
            'Jurinet.reinject: end of <DOCUMENT> tag not found: the document could be malformed or corrupted.',
          );
        }
      } else {
        throw new Error(`Jurinet.reinject: pending decision '${decision.sourceId}' not found.`);
      }
    } else {
      throw new Error('Jurinet.reinject: not connected.');
    }
  }

  /**
   * Method to mark a Jurinet document as being imported for Label.
   *
   * @param {*} id
   * @returns
   * @throws
   */
  async markAsImported(id) {
    if (!id) {
      throw new Error(`Jurinet.markAsImported: invalid ID '${id}'.`);
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the original decision from Jurinet:
      const readQuery = `SELECT * 
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id
        AND ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = :none`;
      const readResult = await this.connection.execute(readQuery, [id, 0]);
      if (readResult && readResult.rows && readResult.rows.length > 0) {
        // 2. Update query:
        const updateQuery = `UPDATE ${process.env.DB_TABLE}
          SET ${process.env.DB_STATE_FIELD}=:pending
          WHERE ${process.env.DB_ID_FIELD}=:id`;
        await this.connection.execute(updateQuery, [1, id], { autoCommit: true });
        return true;
      } else {
        throw new Error(`Jurinet.markAsImported: original decision '${id}' not found.`);
      }
    } else {
      throw new Error('Jurinet.markAsImported: not connected.');
    }
  }

  /**
   * Method to retrieve the info about the Jurica decision
   * contested by a Jurinet decision (using its ID).
   *
   * @param {*} id
   * @returns
   * @throws
   */
  async getDecatt(id) {
    /* From Richard ANGER (03/03/2021):
    1. DOCUMENT.ID_DOCUMENT = ID de la décision
    Ex : 1727146
    2. Table DOCUM.NUMPOURVOI
    ID_DOCUMENT   LIB = N° pourvoi complet  NUMPOURVOICODE = N° pourvoi sans clé
    1727146       U1826378                  1826378
    3. Table GPCIV.AFF
    CODE      ID_AFFAIRE = identifiant du pourvoi
    1826378   11110412
    4. Table GPCIV.DECATT
    ID_AFFAIRE  NUM_RG = N° RG de la décision attaquée
    11110412    16/02749
    */
    if (!id) {
      throw new Error(`Jurinet.getDecatt: invalid ID '${id}'.`);
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the decision from Jurinet:
      const decisionQuery = `SELECT * 
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id`;
      const decisionResult = await this.connection.execute(decisionQuery, [id]);
      if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
        // 2. Get the pourvoi related to the decision:
        const pourvoiQuery = `SELECT * 
          FROM NUMPOURVOI
          WHERE NUMPOURVOI.ID_DOCUMENT = :id`;
        const pourvoiResult = await this.connection.execute(pourvoiQuery, [id]);
        if (pourvoiResult && pourvoiResult.rows && pourvoiResult.rows.length > 0) {
          // 3. Get the affaire related to the pourvoi:
          const pourvoi = pourvoiResult.rows[0];
          const codePourvoi = pourvoi['NUMPOURVOICODE'];
          const affaireQuery = `SELECT * 
            FROM GPCIV.AFF
            WHERE GPCIV.AFF.CODE = :code`;
          const affaireResult = await this.connection.execute(affaireQuery, [codePourvoi]);
          if (affaireResult && affaireResult.rows && affaireResult.rows.length > 0) {
            // 4. Get the contested decision related to the affaire:
            const affaire = affaireResult.rows[0];
            const idAffaire = affaire['ID_AFFAIRE'];
            const decattQuery = `SELECT * 
              FROM GPCIV.DECATT
              WHERE GPCIV.DECATT.ID_AFFAIRE = :id`;
            const decattResult = await this.connection.execute(decattQuery, [idAffaire]);
            if (decattResult && decattResult.rows && decattResult.rows.length > 0) {
              return decattResult.rows[0];
            } else {
              throw new Error(
                `Jurinet.getDecatt: contested decision not found in GPVIV.DECATT for affaire '${idAffaire}'.`,
              );
            }
          } else {
            throw new Error(`Jurinet.getDecatt: affaire not found in GPVIV.AFF for pourvoi '${codePourvoi}'.`);
          }
        } else {
          throw new Error(`Jurinet.getDecatt: pourvoi not found in NUMPOURVOI for decision '${id}'.`);
        }
      } else {
        throw new Error(`Jurinet.getDecatt: decision '${id}' not found.`);
      }
    } else {
      throw new Error('Jurinet.getDecatt: not connected.');
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
      throw new Error(`Jurinet.getDecisionByID: invalid ID '${id}'.`);
    } else if (this.connected === true && this.connection !== null) {
      const decisionQuery = `SELECT * 
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id`;

      const decisionResult = await this.connection.execute(decisionQuery, [id]);
      if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
        return await this.buildRawData(decisionResult.rows[0], true);
      } else {
        throw new Error(`Jurinet.getDecisionByID: decision with ID '${id}' not found.`);
      }
    } else {
      throw new Error('Jurinet.getDecisionByID: not connected.');
    }
  }
}

exports.JurinetOracle = JurinetOracle;
