const needle = require('needle');

module.exports.findAffaire = async function findAffaire(id) {
  if(!id){
    return undefined
  }
  const route = `${process.env.DBSDER_API_URL}/affaires?decisionId=${id}`;
  try {
    const response = await needle('get', route, null, {
      headers: { 'x-api-key': process.env.DBSDER_API_KEY }
    });
    
    if (response.statusCode === 404) {
      return undefined;
    }
    
    if (response.statusCode !== 200) {
      throw new Error(
        `Call GET - ${route} response with code ${response.statusCode}: ${response.body.message}`
      );
    }
    
    return response.body;
  } catch (err) {
    throw err;
  }
}