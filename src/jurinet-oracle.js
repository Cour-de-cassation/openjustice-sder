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
        console.info(`Connected to Oracle v${this.connection.oracleServerVersionString}.`);
      }
    } else {
      throw new Error('Already connected.');
    }
  }

  async close() {
    if (this.connected === true && this.connection !== null) {
      await this.connection.close();
      if (this.verbose === true) {
        console.info('Disconnected from Oracle.');
      }
    } else {
      throw new Error('Not connected.');
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
      throw new Error('Not connected.');
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
      // Source DBs are full of "holes" so we need to set a limit:
      let ago = new Date();
      ago.setMonth(ago.getMonth() - 1);
      ago.setHours(0, 0, 0, 0);
      let strAgo = ago.getDate() < 10 ? '0' + ago.getDate() : ago.getDate();
      strAgo += '/' + (ago.getMonth() + 1 < 10 ? '0' + (ago.getMonth() + 1) : ago.getMonth() + 1);
      strAgo += '/' + ago.getFullYear();
      // Sword uses '01/06/2016' as date limit
      const query = `SELECT * 
        FROM ${process.env.DB_TABLE}
        WHERE ${process.env.DB_TABLE}.${process.env.DB_ANO_TEXT_FIELD} IS NULL
        AND ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = 0
        AND ${process.env.DB_TABLE}.DT_CREATION >= TO_DATE('${strAgo}', 'DD/MM/YYYY')
        ORDER BY ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} ASC`;
      const result = await this.connection.execute(query);
      if (result && result.rows && result.rows.length > 0) {
        let rows = [];
        for (let i = 0; i < result.rows.length; i++) {
          let row = {};
          for (let key in result.rows[i]) {
            switch (key) {
              case process.env.DB_ID_FIELD:
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
      throw new Error('Not connected.');
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
      throw new Error('Not connected.');
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
      throw new Error('Invalid decision to reinject.');
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the original decision from Jurinet:
      const readQuery = `SELECT * 
          FROM ${process.env.DB_TABLE}
          WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id
          AND ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = :pending`;
      let readResult = null;
      try {
        readResult = await this.connection.execute(readQuery, [decision.sourceId, 1]);
      } catch (e) {
        console.error(e);
      }
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
            SET ${process.env.DB_TABLE}.${process.env.DB_ANO_TEXT_FIELD} = :xmla,
            ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = :ok,
            ${process.env.DB_TABLE}.AUT_ANO = :label,
            ${process.env.DB_TABLE}.DT_ANO = :datea,
            ${process.env.DB_TABLE}.DT_MODIF_ANO = :dateb,
            ${process.env.DB_TABLE}.DT_ENVOI_DILA = NULL
            WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id`;
          try {
            await this.connection.execute(
              updateQuery,
              [xmla.toString(), parseInt(process.env.DB_STATE_OK), 'LABEL', now, now, decision.sourceId],
              { autoCommit: true },
            );
          } catch (e) {
            console.error(e);
          }
          return true;
        } else {
          throw new Error('End of <DOCUMENT> tag not found: the document could be malformed or corrupted.');
        }
      } else {
        throw new Error(`Pending decision '${decision.sourceId}' not found.`);
      }
    } else {
      throw new Error('Not connected.');
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
      throw new Error(`Invalid ID '${id}'.`);
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the original decision from Jurinet:
      const readQuery = `SELECT * 
          FROM ${process.env.DB_TABLE}
          WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id
          AND ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = :none`;
      let readResult = null;
      try {
        readResult = await this.connection.execute(readQuery, [id, 0]);
      } catch (e) {
        console.error(e);
      }
      if (readResult && readResult.rows && readResult.rows.length > 0) {
        // 2. Update query:
        const updateQuery = `UPDATE ${process.env.DB_TABLE}
            SET ${process.env.DB_TABLE}.${process.env.DB_STATE_FIELD} = :pending,
            WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id`;
        try {
          await this.connection.execute(updateQuery, [1, id], { autoCommit: true });
        } catch (e) {
          console.error(e);
        }
        return true;
      } else {
        throw new Error(`Original decision '${id}' not found.`);
      }
    } else {
      throw new Error('Not connected.');
    }
  }

  /**
   * Method to retrieve the chain of decisions.
   *
   * @param {*} id
   * @returns
   * @throws
   */
  async getChain(id) {
    /*
    DOCUM.DOCUMENT 
    DOCUMENT.ID_DOCUMENT = ID de la décision
    Ex : 1727146

    >> Table DOCUM.NUMPOURVOI
    ID_DOCUMENT                LIB = N° pourvoi complet             NUMPOURVOICODE = N° pourvoi sans clé
    1727146                               U1826378                                           1826378

    >> Table GPVIV. AFF
    CODE                                    ID_AFFAIRE = identifiant du pourvoi
    1826378                               11110412

    >> Table GPCIV.DECATT
    ID_AFFAIRE                       NUM_RG = N° RG de la décision attaquée
    11110412                             16/02749
     */
    if (!id) {
      throw new Error(`Invalid ID '${id}'.`);
    } else if (this.connected === true && this.connection !== null) {
      // 1. Get the decision from Jurinet:
      const decisionQuery = `SELECT * 
          FROM ${process.env.DB_TABLE}
          WHERE ${process.env.DB_TABLE}.${process.env.DB_ID_FIELD} = :id`;
      let decisionResult = null;
      try {
        decisionResult = await this.connection.execute(decisionQuery, [id]);
      } catch (e) {
        console.error(e);
      }
      if (decisionResult && decisionResult.rows && decisionResult.rows.length > 0) {
        const decision = decisionResult.rows[0];
        const pourvoiQuery = `SELECT * 
          FROM NUMPOURVOI
          WHERE NUMPOURVOI.ID_DOCUMENT = :id`;
        let pourvoiResult = null;
        try {
          pourvoiResult = await this.connection.execute(pourvoiQuery, [id]);
        } catch (e) {
          console.error(e);
        }
        if (pourvoiResult && pourvoiResult.rows && pourvoiResult.rows.length > 0) {
          console.log(pourvoiResult.rows);
          return true;
        } else {
          throw new Error(`Pourvoi not found in NUMPOURVOI for decision '${id}'.`);
        }
      } else {
        throw new Error(`Decision '${id}' not found.`);
      }
    } else {
      throw new Error('Not connected.');
    }
  }
}

exports.JurinetOracle = JurinetOracle;
