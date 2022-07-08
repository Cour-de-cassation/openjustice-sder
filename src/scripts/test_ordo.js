const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { MongoClient } = require('mongodb');

const ids = [
  1777053, 1777049, 1777050, 1777051, 1777052, 1781408, 1781409, 1776991, 1776992, 1776995, 1776996, 1776967, 1776968,
  1777071, 1776975, 1777074, 1776979, 1777045, 1777046, 1779173, 1779194, 1779220, 1779225, 1779250, 1779174, 1781762,
  1781790, 1779209, 1779234, 1779213, 1779240, 1779217, 1779244, 1779254, 1779261, 1780547, 1776952, 1776953, 1777024,
  1777025, 1777026, 1777029, 1777030, 1776999, 1777000, 1779204, 1779221, 1779247, 1779169, 1779170, 1779205, 1779149,
  1779235, 1779236, 1779237, 1776980, 1779241, 1779153, 1779157, 1779158, 1779159, 1779255, 1779262, 1780548, 1780549,
  1776985, 1776986, 1776971, 1776972, 1776976, 1777011, 1779016, 1776951, 1776983, 1779015, 1780550, 1780551, 1776958,
  1779162, 1779164, 1779165, 1779199, 1779200, 1779230, 1779231, 1779150, 1779180, 1779154, 1779184, 1779188, 1779189,
  1779190, 1779263, 1777040, 1776957, 1777060, 1777056, 1777057, 1776961, 1777059, 1777061, 1777062, 1777063, 1779219,
  1777033, 1777034, 1777003, 1777004, 1777007, 1777008, 1777012, 1777043, 1776984, 1777015, 1779195, 1779196, 1779226,
  1779227, 1779251, 1779175, 1779181, 1779210, 1779185, 1779214, 1779218, 1777044, 1779256, 1779264, 1780552, 1777018,
  1777019, 1776989, 1776990, 1776962, 1776993, 1776965, 1776966, 1777067, 1776969, 1777037, 1777038, 1777041, 1779176,
  1777016, 1777017, 1777047, 1779222, 1779223, 1779252, 1779171, 1779206, 1776998, 1779211, 1779238, 1779215, 1779242,
  1779245, 1779160, 1779257, 1779265, 1779266, 1776954, 1776955, 1776956, 1777022, 1777023, 1776994, 1777027, 1776997,
  1777069, 1777070, 1776973, 1777072, 1776970, 1777001, 1777073, 1776977, 1777078, 1777075, 1777076, 1777077, 1777048,
  1779248, 1779166, 1779167, 1779172, 1779201, 1779207, 1779232, 1779233, 1779239, 1779151, 1779243, 1779155, 1779161,
  1779191, 1779258, 1779267, 1779268, 1776987, 1776988, 1779182, 1777054, 1777055, 1777028, 1777058, 1777031, 1777032,
  1777002, 1777035, 1776974, 1777005, 1776978, 1777009, 1776981, 1776982, 1779246, 1779168, 1779197, 1779202, 1779203,
  1779228, 1779148, 1779177, 1779152, 1776959, 1776960, 1777013, 1779156, 1779186, 1779192, 1779269, 1779259, 1777020,
  1777021, 1776963, 1776964, 1777064, 1777065, 1777066, 1777036, 1777068, 1777006, 1777039, 1777010, 1777042, 1777014,
  1779163, 1779193, 1779198, 1779224, 1785380, 1785381, 1785382, 1785564, 1779229, 1779249, 1779178, 1779179, 1779208,
  1779183, 1779212, 1779187, 1779216, 1779253, 1779260, 1785571, 1785572, 1785591, 1785592, 1785388, 1785347, 1785348,
  1785349, 1782845, 1782847, 1782231, 1782268, 1782306, 1782307, 1782314, 1782315, 1782322, 1782323, 1782229, 1782266,
  1782267, 1782386, 1782357, 1785583, 1785584, 1785647, 1785648, 1785597, 1785598, 1785608, 1785609, 1785350, 1785351,
  1782846, 1785355, 1782269, 1782302, 1782338, 1782339, 1782347, 1782348, 1782255, 1782256, 1782300, 1782301, 1782358,
  1782359, 1786179, 1785638, 1785639, 1785372, 1785616, 1785617, 1785626, 1785627, 1785352, 1785353, 1785354, 1785356,
  1785363, 1785565, 1791905, 1791831, 1782848, 1782849, 1782850, 1782303, 1782336, 1782236, 1782237, 1782245, 1782246,
  1782292, 1782293, 1782332, 1782333, 1782360, 1782361, 1785649, 1785650, 1785373, 1785593, 1785383, 1785599, 1785566,
  1785364, 1782222, 1782851, 1782337, 1782232, 1782274, 1782275, 1782284, 1782285, 1782324, 1782325, 1782367, 1782368,
  1782362, 1782363, 1785573, 1785574, 1785600, 1785618, 1782852, 1782308, 1782309, 1782316, 1782317, 1782257, 1785640,
  1782369, 1782370, 1782364, 1782365, 1785585, 1785586, 1785619, 1785558, 1785357, 1782828, 1782829, 1782830, 1782340,
  1782341, 1782349, 1782350, 1782258, 1782294, 1782371, 1782372, 1782366, 1785610, 1785611, 1785641, 1785358, 1785367,
  1782859, 1785384, 1785601, 1785365, 1785366, 1782839, 1782853, 1782854, 1782831, 1782238, 1782239, 1782240, 1782247,
  1782248, 1782295, 1782326, 1782373, 1782374, 1785628, 1785629, 1785651, 1785652, 1785602, 1785620, 1782860, 1782861,
  1782311, 1782832, 1782276, 1782277, 1782278, 1782286, 1782287, 1782327, 1782223, 1782375, 1782376, 1785567, 1785568,
  1785575, 1785576, 1785621, 1785559, 1785368, 1782840, 1782855, 1782310, 1785386, 1782318, 1782319, 1782224, 1782259,
  1782377, 1782378, 1785578, 1785579, 1785580, 1785587, 1785588, 1785560, 1785385, 1782261, 1785359, 1785360, 1782862,
  1782833, 1782834, 1782342, 1782343, 1782351, 1782352, 1782260, 1782296, 1785653, 1782379, 1785630, 1785631, 1785642,
  1785643, 1785603, 1785604, 1785605, 1785369, 1785370, 1782841, 1782856, 1782835, 1782233, 1782241, 1782242, 1782249,
  1782250, 1782297, 1782328, 1782380, 1785632, 1785633, 1785654, 1782863, 1782864, 1785613, 1785594, 1785612, 1785622,
  1785623, 1785361, 1782836, 1782857, 1782270, 1782271, 1782279, 1782280, 1782281, 1782288, 1782289, 1782329, 1782225,
  1782381, 1785569, 1785570, 1785577, 1785589, 1785374, 1785561, 1785562, 1785389, 1785390, 1785339, 1785362, 1785337,
  1782842, 1782837, 1782304, 1782305, 1782312, 1782313, 1782320, 1782321, 1782226, 1782262, 1782263, 1782264, 1782382,
  1785581, 1785582, 1785590, 1785644, 1785375, 1785376, 1785377, 1785378, 1785379, 1785645, 1785387, 1785606, 1785340,
  1785341, 1785338, 1782865, 1782838, 1782355, 1782356, 1782344, 1782345, 1782346, 1782353, 1782354, 1782265, 1782298,
  1782383, 1785634, 1785635, 1785646, 1785655, 1785656, 1785595, 1785596, 1785607, 1785624, 1785342, 1785343, 1782843,
  1782858, 1782334, 1782234, 1782235, 1782243, 1782244, 1782251, 1782252, 1782253, 1782254, 1782299, 1782330, 1782384,
  1785636, 1785637, 1785371, 1791819, 1785614, 1785615, 1785625, 1785563, 1785344, 1785345, 1785346, 1782844, 1782335,
  1782230, 1782272, 1782273, 1782282, 1782283, 1782290, 1782291, 1782331, 1782227, 1782228, 1782385, 1794648, 1794649,
  1791818, 1791846, 1791822, 1791823, 1791826, 1791827, 1789155, 1789074, 1789132, 1789138, 1789156, 1789088, 1789089,
  1789093, 1789119, 1789097, 1789123, 1789502, 1789503, 1791833, 1791834, 1791861, 1791862, 1791865, 1791866, 1791845,
  1791859, 1791918, 1791919, 1794627, 1794606, 1794635, 1794636, 1794637, 1794529, 1794563, 1794567, 1794568, 1790652,
  1794578, 1794579, 1794522, 1791847, 1791848, 1791851, 1791852, 1791855, 1791856, 1789098, 1789099, 1791832, 1789152,
  1789075, 1789102, 1789158, 1789080, 1789084, 1789085, 1789115, 1789116, 1789120, 1789124, 1789149, 1789150, 1789151,
  1791922, 1789504, 1789505, 1791889, 1791890, 1791863, 1791864, 1791895, 1791896, 1791920, 1791921, 1789081, 1794628,
  1794599, 1794638, 1794607, 1794564, 1794597, 1794536, 1794537, 1794573, 1794574, 1794575, 1794582, 1794583, 1794584,
  1794585, 1794526, 1791875, 1791876, 1791879, 1791880, 1791883, 1791884, 1789125, 1789126, 1789108, 1794618, 1789112,
  1789113, 1789143, 1789144, 1789146, 1789068, 1789512, 1789513, 1789506, 1789507, 1791860, 1791887, 1791835, 1791836,
  1791893, 1791894, 1791814, 1791815, 1794600, 1794629, 1794608, 1794609, 1794639, 1789139, 1794569, 1794570, 1794543,
  1794544, 1794547, 1794518, 1794523, 1794557, 1794751, 1794752, 1794753, 1791901, 1791902, 1791903, 1791904, 1791824,
  1791908, 1791909, 1789103, 1789129, 1789161, 1789162, 1789109, 1789135, 1789140, 1794620, 1789064, 1789065, 1789069,
  1789094, 1789515, 1789508, 1791888, 1791891, 1791892, 1791810, 1791811, 1791812, 1791813, 1791843, 1791844, 1791873,
  1791874, 1794630, 1794601, 1794610, 1794645, 1794614, 1794619, 1789086, 1794576, 1794577, 1794548, 1794580, 1794519,
  1794553, 1794558, 1794591, 1794527, 1794561, 1791820, 1791821, 1791849, 1791825, 1791853, 1789153, 1789154, 1789130,
  1789159, 1789078, 1789079, 1789136, 1789163, 1789060, 1794631, 1789090, 1789091, 1789095, 1789121, 1789516, 1789509,
  1789510, 1789511, 1791809, 1791837, 1791838, 1791839, 1791840, 1791841, 1791842, 1791871, 1791872, 1791912, 1791923,
  1791924, 1791925, 1791926, 1791927, 1794602, 1794621, 1789082, 1794640, 1794641, 1794615, 1794598, 1794581, 1794516,
  1794517, 1794554, 1794586, 1794587, 1794592, 1791850, 1791877, 1791828, 1791829, 1791830, 1789072, 1789073, 1789160,
  1789076, 1789106, 1789107, 1789164, 1789122, 1789147, 1791932, 1789087, 1789114, 1789117, 1789118, 1789496, 1789497,
  1791867, 1791868, 1791869, 1791870, 1791899, 1791900, 1791913, 1791928, 1791929, 1791930, 1791931, 1791933, 1791934,
  1791935, 1791936, 1791937, 1791938, 1791939, 1791940, 1791941, 1789100, 1794632, 1794603, 1794611, 1794622, 1794530,
  1794531, 1794538, 1794539, 1794551, 1794552, 1794588, 1794524, 1794525, 1794562, 1794595, 1796584, 1791854, 1791881,
  1791857, 1791858, 1789101, 1794633, 1789077, 1789104, 1789133, 1789134, 1789083, 1789110, 1789141, 1789142, 1789145,
  1789066, 1789148, 1789070, 1789498, 1789499, 1791897, 1791898, 1791816, 1791817, 1791914, 1791915, 1791910, 1791911,
  1794604, 1789127, 1794642, 1794643, 1794644, 1794646, 1794647, 1794623, 1794624, 1794565, 1794566, 1794571, 1794572,
  1794520, 1794521, 1794555, 1794556, 1794559, 1794560, 1794596, 1791878, 1791907, 1791882, 1791906, 1791885, 1791886,
  1789128, 1794617, 1789105, 1789131, 1789157, 1789111, 1789137, 1789061, 1789062, 1789063, 1789067, 1789092, 1789071,
  1789096, 1789500, 1789501, 1791916, 1791917, 1794625, 1794626, 1794634, 1794605, 1794612, 1794613, 1794616, 1794542,
  1794528, 1794532, 1794533, 1794534, 1794535, 1794540, 1794541, 1799722, 1799723, 1798955, 1794545, 1794546, 1794549,
  1794550, 1794589, 1794590, 1794593, 1794594, 1799032, 1799039, 1798939, 1798940, 1798947, 1798948, 1798956, 1798974,
  1799054, 1799074, 1799076, 1799077, 1798914, 1798907, 1798964, 1798973, 1796813, 1797026, 1796821, 1796790, 1799040,
  1798967, 1798917, 1798918, 1798925, 1798926, 1798933, 1798934, 1799057, 1798908, 1798877, 1799029, 1796824, 1797027,
  1796997, 1796791, 1796822, 1796823, 1796825, 1796826, 1799081, 1798968, 1798977, 1798981, 1798982, 1798989, 1798990,
  1798997, 1798998, 1799078, 1799079, 1799080, 1799082, 1799083, 1799084, 1799085, 1799086, 1799087, 1799088, 1799089,
  1799090, 1799091, 1799092, 1799093, 1799017, 1798878, 1798879, 1799030, 1799037, 1796998, 1796781, 1796792, 1796793,
  1796829, 1796830, 1798978, 1799033, 1799001, 1799002, 1799009, 1799010, 1799018, 1799098, 1799058, 1799096, 1799097,
  1799099, 1799100, 1798957, 1798880, 1798881, 1799038, 1798965, 1796782, 1796814, 1796815, 1796828, 1796796, 1796797,
  1799094, 1799034, 1799041, 1798941, 1798942, 1798949, 1798950, 1798958, 1798884, 1799059, 1798882, 1798883, 1798937,
  1798966, 1798975, 1796816, 1797028, 1796794, 1796795, 1796798, 1796799, 1799095, 1799042, 1798915, 1798919, 1798920,
  1798927, 1798928, 1798935, 1798936, 1799060, 1798888, 1798892, 1798938, 1798999, 1797029, 1796833, 1796834, 1798983,
  1798984, 1798991, 1798992, 1799061, 1799043, 1798889, 1798890, 1799000, 1799019, 1796827, 1796835, 1799003, 1799004,
  1799011, 1799012, 1799044, 1799062, 1798891, 1798897, 1798885, 1799020, 1798959, 1798943, 1798944, 1798951, 1798952,
  1799045, 1799046, 1798893, 1798894, 1798886, 1798887, 1798960, 1798969, 1798921, 1798922, 1798929, 1798930, 1799063,
  1799064, 1799047, 1798895, 1798896, 1798898, 1795135, 1795132, 1795133, 1795134, 1795136, 1799006, 1798970, 1799021,
  1796783, 1798985, 1798986, 1798993, 1798994, 1799048, 1799065, 1798899, 1798900, 1799022, 1799023, 1796996, 1796775,
  1796817, 1796818, 1799005, 1799070, 1799013, 1799014, 1799066, 1799067, 1799049, 1798901, 1798909, 1799724, 1799024,
  1798961, 1796776, 1796810, 1797030, 1797031, 1798945, 1798946, 1798953, 1798954, 1799050, 1799068, 1799069, 1798903,
  1798910, 1798902, 1796811, 1797024, 1797025, 1797055, 1798988, 1798962, 1798971, 1796784, 1796785, 1798916, 1798923,
  1798924, 1798931, 1798932, 1799071, 1799051, 1798904, 1798911, 1798972, 1799025, 1796819, 1796820, 1798979, 1798980,
  1798987, 1799056, 1798995, 1798996, 1799052, 1799072, 1799075, 1798912, 1798905, 1799026, 1799027, 1797056, 1796777,
  1797032, 1797033, 1798976, 1799031, 1799035, 1799036, 1799007, 1799008, 1799015, 1799016, 1799073, 1799053, 1799055,
  1796812, 1798906, 1798913, 1799028, 1798963, 1796778, 1796779, 1796780, 1796789, 1796786, 1796787, 1796788,
];

async function main() {
  const client = new MongoClient(process.env.MONGO_URI, {
    useUnifiedTopology: true,
  });
  await client.connect();

  const database = client.db(process.env.MONGO_DBNAME);
  const rawJurinet = database.collection(process.env.MONGO_JURINET_COLLECTION);
  const decisions = database.collection(process.env.MONGO_DECISIONS_COLLECTION);

  let notFoundInRaw = 0;
  let notFoundInSDER = 0;
  let indexed = 0;
  let notIndexed = 0;

  for (let i = 0; i < ids.length; i++) {
    const rawDocument = await rawJurinet.findOne({ _id: ids[i] });
    if (rawDocument !== null) {
      const decision = await decisions.findOne({ sourceId: ids[i], sourceName: 'jurinet' });
      if (decision !== null) {
        if (rawDocument._indexed !== true) {
          console.log(`Decision ${ids[i]} not indexed: ${rawDocument._indexed}.`);
          notIndexed++;
        } else {
          indexed++;
        }
      } else {
        console.log(`Decision ${ids[i]} not found in SDER.`);
        notFoundInSDER++;
      }
    } else {
      console.log(`Decision ${ids[i]} not found in rawJurinet.`);
      notFoundInRaw++;
    }
  }

  console.log(
    `Done - notFoundInRaw: ${notFoundInRaw}, notFoundInSDER: ${notFoundInSDER}, notIndexed: ${notIndexed}, indexed: ${indexed}.`,
  );

  await client.close();
  return true;
}

main();
