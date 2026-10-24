const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('growth-schoolv3.html', 'utf8');
const schoolSource = fs.readFileSync('js/bl-schools.js', 'utf8');
const names = [...schoolSource.matchAll(/^\s*'([^']+)',?\s*$/gm)].map((m) => m[1]);

function facts() {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync('js/dormitory-facts.js', 'utf8'), sandbox);
  return sandbox.DORMITORY_FACTS;
}

test('dormitory facts are no longer a blocking head script', () => {
  // 2026-10-08 起：宿舍事实数据（gzip 约 143KB）从 <head> 移除，改为进入宿舍页时按需加载。
  // 它原本阻塞全站首屏（实测 1.5Mbps 弱网 FCP 4.54s），而数据只有宿舍页用得上。
  assert.doesNotMatch(html, /<script src="js\/dormitory-facts\.js[^"]*"><\/script>/);
  assert.match(html, /<script src="js\/dormitory\.js(?:\?[^"]*)?"><\/script>/);
});

test('dormitory facts load on demand and expose a retry path', () => {
  const script = fs.readFileSync('js/dormitory.js', 'utf8');
  assert.match(script, /function loadFacts\(/);
  assert.match(script, /js\/dormitory-facts\.js\?v=/);
  assert.match(script, /global\.enterDormitoryPage = function/);
  assert.match(script, /dormitoryFactsRetry/);
});

test('every curated fact has a directory school, attributable source and precise scope', () => {
  const data = facts();
  assert.ok(Object.keys(data).length >= 3, 'at least three sourced schools');
  for (const [school, rows] of Object.entries(data)) {
    assert.ok(names.includes(school), `not in the 2361-school directory: ${school}`);
    assert.ok(Array.isArray(rows) && rows.length > 0, `${school}: no facts`);
    for (const row of rows) {
      assert.ok(typeof row.campus === 'string' && typeof row.building === 'string' && row.scope, `${school}: scope missing`);
      assert.ok(row.sourceTitle && row.sourceTitle.trim(), `${school}: source name missing`);
      const minimumSourceYear = row.sourceType === 'official_public' ? 2010 : 2020;
      assert.ok(Number.isInteger(row.sourceYear) && row.sourceYear >= minimumSourceYear && row.sourceYear <= 2026);
      if (row.sourceType === 'official_public' && row.sourceYear < 2020) {
        assert.match(row.sourceYearLabel || '', /历史|可能已调整|待核实/);
      }
      if (row.sourceType === 'official_public') {
        assert.match(row.sourceUrl, /^https?:\/\/[^\s/]+\/\S+$/, `${school}: official public URL invalid`);
        assert.match(row.accessedAt, /^2026-09-(25|26)$/, `${school}: official public access date missing`);
        assert.ok(row.scope.includes('待核实') || row.scope.includes('仅供参考'), `${school}: official public uncertainty missing`);
        assert.ok(row.description && /待核实|线索|不代表/.test(row.description), `${school}: official public caveat missing`);
      } else if (row.sourceType === 'third_party') {
        assert.match(row.sourceUrl, /^https?:\/\/[^\s/]+\/\S+$/, `${school}: third-party URL invalid`);
        assert.match(row.accessedAt, /^2026-09-(25|26)$/, `${school}: access date missing`);
        assert.ok(row.scope.includes('待核实') || row.scope.includes('仅供参考'), `${school}: uncertainty missing`);
      } else if (row.sourceType === 'research_notice') {
        assert.match(row.sourceUrl, /^https?:\/\/[^\s/]+\/\S+$/, `${school}: research notice URL invalid`);
        assert.match(row.accessedAt, /^2026-09-(25|26)$/, `${school}: research notice access date missing`);
        assert.match(row.scope, /待补|未找到|不代表/, `${school}: research notice must be transparent`);
        assert.match(row.description, /待补|未找到|不代表/, `${school}: research notice description missing caveat`);
      } else if (row.sourceType === 'public_search_lead') {
        assert.match(row.sourceUrl, /^https?:\/\/[^\s/]+\/\S+$/, `${school}: search lead URL invalid`);
        assert.match(row.accessedAt, /^2026-09-(25|26)$/, `${school}: search lead access date missing`);
        assert.match(row.scope, /待核实|线索/, `${school}: search lead must be transparent`);
        assert.match(row.description, /线索|核验|不代表/, `${school}: search lead description missing caveat`);
      } else if (row.sourceType === 'community_lead') {
        assert.match(row.sourceUrl, /^https?:\/\/[^\s/]+\/\S+$/, `${school}: community lead URL invalid`);
        assert.match(row.accessedAt, /^2026-09-(25|26)$/, `${school}: community lead access date missing`);
        assert.match(row.scope, /线索|未核实|不代表/, `${school}: community lead must be low-trust labeled`);
        assert.match(row.description, /线索|核验|不代表|低可信/, `${school}: community lead description missing caveat`);
        assert.equal(row.occupancy, '', `${school}: community lead must not invent room count`);
        assert.equal(row.bedType, '', `${school}: community lead must not invent bed type`);
        assert.equal(row.bathroom, '', `${school}: community lead must not invent bathroom`);
      } else if (row.sourceType === 'catalog_profile') {
        assert.match(row.sourceUrl, /^https?:\/\/[^\s/]+\/\S+$/, `${school}: catalog profile URL invalid`);
        assert.match(row.accessedAt, /^2026-09-(25|26)$/, `${school}: catalog profile access date missing`);
        assert.match(row.scope, /待补|未找到|不代表/, `${school}: catalog profile must be transparent`);
        assert.match(row.description, /资料卡|待补|未找到|不代表/, `${school}: catalog profile description missing caveat`);
      } else {
        assert.ok(!row.sourceType || row.sourceType === 'official', `${school}: unknown source tier`);
        assert.match(row.sourceUrl, /^https:\/\/[^\s]+\.edu\.cn\//, `${school}: official source required`);
        assert.ok(row.campus && row.building, `${school}: official building scope missing`);
      }
      assert.ok(row.occupancy || row.bedType || row.bathroom || row.description, `${school}: no dormitory content`);
      if (row.description) assert.ok(row.description.length <= 500, `${school}: summary too long`);
    }
  }
});

test('every directory school has a visible prefilled dormitory description', () => {
  const data = facts();
  const uniqueNames = [...new Set(names)];
  assert.equal(Object.keys(data).length, uniqueNames.length, 'every unique directory school should have a facts card');
  for (const school of uniqueNames) {
    assert.ok(data[school]?.some((row) => typeof row.description === 'string' && row.description.trim()), `missing prefilled description: ${school}`);
  }
  const rows = Object.values(data).flat();
  assert.equal(rows.filter((row) => !row.description || !row.description.trim()).length, 0, 'all fact rows should render a description');
});
test('twenty-fifth batch keeps official room count without inventing building, bed or bathroom', () => {
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实补充批次二十五.json', 'utf8'));
  const data = facts();
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceType === item.sourceType && row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing official entry for ${item.name}`);
    assert.equal(match.occupancy, item.occupancy);
    assert.equal(match.description, item.description);
    assert.equal(match.campus, '');
    assert.equal(match.building, '');
    assert.equal(match.bedType, '');
    assert.equal(match.bathroom, '');
  }
});
test('cover is not counted as a verified description or an interior photo', () => {
  const data = facts();
  const covered = Object.keys(data).filter((school) => data[school].some((row) => row.occupancy || row.bedType || row.bathroom || row.description));
  assert.equal(covered.length, new Set(names).size, 'every unique directory school must have a transparent prefill record');
  assert.equal(covered.length, Object.keys(data).length);
  assert.ok(covered.length >= 2084, `expected reviewed batches to materially expand coverage; got ${covered.length}`);
  assert.match(fs.readFileSync('tasks/2026-09-25_高校宿舍采集台账.csv', 'utf8'), /已核实描述/);
});

test('new public-source batch keeps uncertainty and source tiers explicit', () => {
  const data = facts();
  const tianjin = data['天津警察学院'].find((row) => row.sourceType === 'official_public');
  assert.ok(tianjin);
  assert.equal(tianjin.occupancy, '4–6人间');
  assert.match(tianjin.scope, /楼号.*待核实/);
  const foshan = data['佛山科学技术学院'].find((row) => row.sourceType === 'public_search_lead');
  assert.ok(foshan);
  assert.match(foshan.description, /仙溪校区/);
  assert.match(foshan.scope, /不能代表全部校区/);
  const beijing = data['北京电子科技职业学院'].find((row) => row.sourceType === 'public_search_lead');
  assert.ok(beijing);
  assert.match(beijing.description, /冲突|待核实|未完成核验/);
});

test('2026 dorm research records do not infer unreported beds or room count', () => {
  const data = facts();
  const nju = data['南京大学'];
  assert.ok(nju?.some((row) => row.campus === '仙林校区' && row.bathroom.includes('独立卫浴') && !row.occupancy && !row.bedType));
  const ruc = data['中国人民大学'];
  assert.match(fs.readFileSync('js/dormitory.js', 'utf8'), /row\.sourceYearLabel \|\| row\.sourceYear/);
  assert.ok(ruc?.some((row) => row.building === '知行1楼' && row.bathroom.includes('楼内公共浴室') && !row.occupancy && !row.bedType));
  assert.ok(ruc?.some((row) => row.building === '东风1楼' && row.bathroom.includes('楼内公共浴室') && row.sourceYearLabel.includes('未署发表日期')));
});

test('first researched third-party dormitory facts are scoped to actual schools', () => {
  const data = facts();
  assert.equal(data['北京大学'].find((r) => r.sourceType === 'third_party').occupancy, '本科生4人间');
  const lanzhou = data['兰州大学'].find((r) => r.sourceType === 'third_party');
  assert.match(lanzhou.bathroom, /公共卫生间/);
  assert.doesNotMatch(lanzhou.bathroom, /独立卫浴/);
  assert.equal(lanzhou.building, '');
});


test('new third-party batch paraphrases scoped room attributes without calling covers photos', () => {
  const data = facts();
  assert.equal(data['山东农业工程学院'][0].occupancy, '6至8人间');
  assert.match(data['山东农业工程学院'][0].bathroom, /部分独立卫生间、部分公用卫生间/);
  assert.match(data['九江学院'][0].bathroom, /公共浴室或宿舍卫生间/);
  assert.match(data['菏泽学院'][0].occupancy, /1、2、7、11号楼为8人间/);
  assert.equal(data['菏泽学院'][0].bathroom, '');
  assert.ok(Object.keys(data).length >= 1836);
  assert.ok(data['上海交通大学'][0].description.includes('房型线索'));
  assert.ok(data['上海纽约大学'][0].description.includes('配套线索') || data['上海纽约大学'][0].description.includes('楼栋线索'));
});

test('third batch preserves distinct bathroom scopes and unknown fields', () => {
  const data = facts();
  const east = data['上海东海职业技术学院'][0];
  assert.equal(east.occupancy, '标准4人间');
  assert.match(east.bathroom, /第11学生公寓/);
  assert.match(east.scope, /不能推断每间独卫/);
  const shau = data['上海工艺美术职业学院'][0];
  assert.match(shau.bathroom, /无独立卫浴/);
  assert.equal(shau.bedType, '');
  const sr = data['上饶职业技术学院'][0];
  assert.match(sr.bathroom, /7号公寓有独立卫生间；普通公寓无独立卫生间/);
  assert.equal(data['东北农业大学'][0].bedType, '');
  assert.match(data['上海建桥学院'][0].bathroom, /女生寝室有独立卫浴；男生按需求选择/);
});

test('fourth batch keeps building and population variants separate', () => {
  const data = facts();
  const petroleum = data['中国石油大学（北京）'].filter((r) => r.sourceType === 'third_party');
  assert.equal(petroleum.find((r) => r.building === '润杰学生公寓').occupancy, '本科生6人间');
  assert.equal(petroleum.find((r) => r.building === '青年园公寓').occupancy, '本科生4人间');
  const academy = data['中国社会科学院大学'];
  assert.match(academy.find((r) => r.building === '7、8号楼').scope, /2022级新生/);
  assert.equal(academy.find((r) => r.building === '1至6号楼').bedType, '');
  const torch = data['中山火炬职业技术学院'];
  assert.equal(torch.find((r) => r.building === '5至8栋').occupancy, '');
  assert.match(data['中山大学'][0].bathroom, /仅配电梯的高层宿舍/);
  assert.match(data['乌兰察布职业学院'][0].bathroom, /无独立卫生间/);
});

test('source candidate index lists unique directory schools but does not publish unreviewed text', () => {
  const text = fs.readFileSync('tasks/2026-09-25_宿舍来源候选索引.csv', 'utf8').replace(/^\uFEFF/, '');
  const lines = text.trim().split(/\r?\n/);
  assert.ok(lines.length > 1000, 'large source work queue available');
  const indexed = lines.slice(1).map((line) => line.split(',')[0]);
  assert.equal(indexed.length, new Set(indexed).size);
  assert.ok(indexed.every((name) => names.includes(name)));
  assert.ok(lines.slice(1).every((line) => line.includes('待核查事实；非预置描述')));
});


test('sixth and seventh research batches retain exact school sources and building scope', () => {
  const data = facts();
  const sixth = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次六.json', 'utf8'));
  const seventh = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次七.json', 'utf8'));
  assert.equal(sixth.length, 8);
  assert.equal(seventh.length, 16);
  for (const item of [...sixth, ...seventh]) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing source-backed entry for ${item.name}`);
    assert.equal(match.description, item.description);
    assert.equal(match.sourceType, 'third_party');
  }
  const hb = data['河北经贸大学'].find((row) => row.sourceUrl.includes('/18358.html'));
  assert.match(hb.description, /20—24栋.*上床下桌/);
  assert.match(hb.description, /3、5—18栋.*独卫/);
  assert.equal(data['云南交通运输职业学院'][0].occupancy, '6人间、8人间');
  assert.match(data['衡水职业技术学院'][0].building, /13号楼、14号楼/);
});


test('student-review batches do not masquerade as current official dormitory configurations', () => {
  const data = facts();
  const eighth = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次八.json', 'utf8'));
  const ninth = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次九.json', 'utf8'));
  assert.equal(eighth.length, 15);
  assert.equal(ninth.length, 12);
  for (const item of [...eighth, ...ninth]) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing reviewed entry: ${item.name}`);
    assert.equal(match.description, item.description);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /学生评价.*待核实/);
    assert.match(match.sourceYearLabel, /原发表日未注明/);
  }
  assert.equal(data['南通师范高等专科学校'][0].building, '集贤、育贤');
  assert.match(data['石家庄人民医学高等专科学校'][0].bedType, /4张上床下桌及2张上下铺/);
  assert.equal(data['齐齐哈尔高等师范专科学校'][0].building, '5号宿舍楼');
});


test('tenth batch keeps legacy-name mapping, building specificity and review caveats', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十.json', 'utf8'));
  assert.equal(batch.length, 21);
  assert.equal(new Set(batch.map((row) => row.name)).size, 15);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl && row.building === item.building);
    assert.ok(match, `missing tenth batch source/building: ${item.name}/${item.building}`);
    assert.equal(match.description, item.description);
    assert.match(match.sourceUrl, /^https:\/\//);
  }
  assert.equal(data['厦门华厦职业学院'].filter((row) => row.sourceYear === 2026).length, 5);
  assert.equal(data['厦门华厦职业学院'].find((row) => row.building === '嘉禾苑1—10号楼').occupancy, '6人间');
  for (const name of ['上海中侨职业技术学院', '上海立达职业技术学院']) {
    assert.match(data[name][0].description, /目录沿用旧校名/);
    assert.equal(data[name][0].sourceType, 'third_party');
  }
  assert.match(data['贵州电子信息职业技术学院'][0].description, /1、2栋可能为公共厕所/);
});


test('eleventh batch keeps legacy mappings and third-party uncertainty', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十一.json', 'utf8'));
  assert.equal(batch.length, 20);
  assert.equal(new Set(batch.map((row) => row.name)).size, 20);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl && row.building === item.building);
    assert.ok(match, `missing eleventh batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /待核实/);
    assert.equal(match.description, item.description);
  }
  assert.match(data['广州科技职业技术学院'].find((row) => row.sourceUrl.includes('24574')).building, /1—10号/);
});



test('twelfth batch keeps legacy-name mappings, scoped buildings and third-party uncertainty', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十二.json', 'utf8'));
  assert.equal(batch.length, 4);
  assert.equal(new Set(batch.map((row) => row.name)).size, 4);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl && row.building === item.building);
    assert.ok(match, `missing twelfth batch source: ${item.name}`);
    assert.equal(match.description, item.description);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /待核实/);
  }
  assert.match(data['广西城市职业学院'][0].building, /崇左校区1—15区/);
  assert.match(data['湖南对外经济贸易职业学院'][0].building, /共9栋/);
  assert.match(data['山西轻工职业技术学院'][0].scope, /学生评价/);
});



test('thirteenth batch keeps sparse third-party facts without inventing missing fields', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十三.json', 'utf8'));
  assert.equal(batch.length, 5);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl && row.building === item.building);
    assert.ok(match, `missing thirteenth batch source: ${item.name}`);
    assert.equal(match.description, item.description);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /待核实/);
  }
  assert.equal(data['朝阳师范学院'][0].occupancy, '4人间、6人间、8人间');
  assert.equal(data['沈阳航空航天大学'][0].occupancy, '2人间、4人间、6人间');
  assert.match(data['甘肃民族师范学院'][0].bathroom, /是否独立未说明/);
});


test('fourteenth batch keeps sparse pages, questionnaire caveats, and official scope', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十四.json', 'utf8'));
  assert.equal(batch.length, 43);
  assert.equal(new Set(batch.map((row) => row.name)).size, 43);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing fourteenth batch source: ${item.name}`);
    assert.equal(match.description, item.description);
    if (item.sourceType === 'third_party') assert.match(match.scope, /待核实|仅供参考/);
  }
  assert.match(data['南京特殊教育师范学院'][0].description, /问卷/);
  assert.match(data['重庆邮电大学'][0].description, /四人间|六人间/);
  assert.equal(data['河南信息统计职业学院'][0].sourceType, 'official');
  assert.match(data['河南信息统计职业学院'][0].bathroom, /独立卫生间/);
});


test('seventeenth batch keeps reviewed current-name mappings and third-party caveats', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十七.json', 'utf8'));
  assert.equal(batch.length, 68);
  assert.equal(new Set(batch.map((row) => row.name)).size, 68);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing seventeenth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /目录|现名|旧校名/);
    assert.match(match.scope, /待核实|仅供参考/);
  }
  assert.match(data['华南理工大学广州学院'][0].description, /广州城市理工学院/);
  assert.match(data['河南大学民生学院'][0].description, /河南开封科技传媒学院/);
});


test('eighteenth batch keeps manually reviewed legacy-name mappings and source scope', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十八.json', 'utf8'));
  assert.equal(batch.length, 12);
  assert.equal(new Set(batch.map((row) => row.name)).size, 12);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing eighteenth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /目录|现名|旧校名/);
    assert.match(match.scope, /待核实|仅供参考/);
    assert.match(match.description, /目录学校名/);
  }
  assert.match(data['兰州理工大学技术工程学院'][0].description, /兰州信息科技学院/);
  assert.match(data['陕西汽车科技职业学院'][0].description, /西安汽车职业大学/);
});


test('nineteenth batch keeps typo-tolerant direct-name pages without inventing buildings', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十九.json', 'utf8'));
  assert.equal(batch.length, 2);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing nineteenth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.equal(match.building, '');
    assert.match(match.scope, /标题.*漏字/);
    assert.match(match.scope, /待核实/);
  }
  assert.match(data['河北环境工程学院'][0].description, /6人间或8人间/);
  assert.match(data['福建技术师范学院'][0].description, /4至6人间/);
});


test('sixteenth batch keeps manually reviewed legacy-name mappings and source scope', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十六.json', 'utf8'));
  assert.equal(batch.length, 37);
  assert.equal(new Set(batch.map((row) => row.name)).size, 37);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing sixteenth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /目录|现名|旧校名/);
    assert.match(match.scope, /待核实|仅供参考/);
    assert.match(match.description, /目录学校名/);
  }
  assert.match(data['九江职业技术学院'][0].description, /江西职业技术大学/);
  assert.match(data['福建工程学院'][0].description, /福建理工大学/);
});

test('fifteenth batch keeps conflicting third-party claims and legacy-name mapping', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次十五.json', 'utf8'));
  assert.equal(batch.length, 5);
  assert.ok(data['上海公安学院'].length >= 2);
  assert.match(data['上海公安学院'].map((row) => row.description).join('；'), /冲突|独立卫生间/);
  assert.ok(data['上海新侨职业技术学院'].some((row) => row.description.includes('现名上海工商职业技术学院')));
  assert.equal(data['上海中华职业技术学院'][0].occupancy, '4人间');
});


test('twentieth batch keeps manually reviewed third-party dormitory facts', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次二十.json', 'utf8'));
  assert.equal(batch.length, 2);
  assert.equal(new Set(batch.map((row) => row.name)).size, 2);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl && row.building === item.building);
    assert.ok(match, `missing twentieth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /待核实|仅供参考/);
    assert.equal(match.description, item.description);
  }
  assert.match(data['北京警察学院'][0].description, /8人间/);
  assert.match(data['华北科技学院'][0].description, /4人间(?:、|和)6人间/);
});


test('twenty-first batch keeps reviewed current-name mappings and third-party caveats', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次二十一.json', 'utf8'));
  assert.equal(batch.length, 10);
  assert.equal(new Set(batch.map((row) => row.name)).size, 10);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl && row.building === item.building);
    assert.ok(match, `missing twenty-first batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.match(match.scope, /目录|校区|分校|省份/);
    assert.match(match.scope, /待核实|仅供参考/);
    assert.ok(match.description);
  }
  assert.match(data['合肥工业大学宣城校区'][0].description, /合肥工业大学/);
  assert.match(data['广东惠州卫生职业技术学院'][0].description, /惠州卫生职业技术学院/);
});

test('twenty-second batch imports only structured public database fields with uncertainty', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次二十二.json', 'utf8'));
  assert.equal(batch.length, 57);
  assert.equal(new Set(batch.map((row) => row.name)).size, 57);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing twenty-second batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.equal(match.building, '');
    assert.match(match.scope, /未逐栋核验|待核实|仅供参考/);
    assert.match(match.description, /宿舍帮|待核实|仅供参考/);
    assert.equal(match.accessedAt, '2026-09-25');
  }
  assert.ok(data['中国人民公安大学'].some((row) => row.occupancy === '6人间'));
  assert.ok(data['深圳北理莫斯科大学'].some((row) => row.bathroom.includes('独立卫浴')));
});

test('all remaining directory schools use an explicit research-notice placeholder', () => {
  const data = facts();
  const directory = new Set(names);
  const notices = Object.entries(data).filter(([, rows]) => rows.some((row) => row.sourceType === 'research_notice'));
  assert.ok(notices.length > 0);
  for (const [school, rows] of notices) {
    assert.ok(directory.has(school), `notice not in directory: ${school}`);
    assert.equal(rows.filter((row) => row.sourceType === 'research_notice').length, 1);
    const row = rows.find((item) => item.sourceType === 'research_notice');
    assert.equal(row.occupancy, '');
    assert.equal(row.bedType, '');
    assert.equal(row.bathroom, '');
    assert.match(row.description, /未找到|待补|不代表/);
    assert.match(row.scope, /未找到|待补|不代表/);
  }
  assert.equal(notices.length, 116);
});

test('all notice schools also have a visible prefilled content card', () => {
  const data = facts();
  const pending = Object.entries(data).filter(([, rows]) => rows.some((row) => row.sourceType === 'research_notice'));
  assert.equal(pending.length, 116);
  for (const [school, rows] of pending) {
    const content = rows.find((row) => row.sourceType === 'public_search_lead' || row.sourceType === 'catalog_profile');
    assert.ok(content, `${school}: missing prefilled content card`);
    assert.ok(content.description && content.description.length <= 500, `${school}: prefilled description missing or too long`);
    assert.match(content.sourceType, /public_search_lead|catalog_profile/);
  }
});

test('twenty-sixth batch keeps manually reviewed historical-name dormitory facts', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次二十六.json', 'utf8'));
  assert.equal(batch.length, 4);
  assert.equal(new Set(batch.map((row) => row.name)).size, 4);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing twenty-sixth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.equal(match.description, item.description);
    assert.match(match.scope, /待核实|第三方资料/);
    assert.equal(match.accessedAt, '2026-09-25');
    assert.ok(match.description.length <= 500);
  }
  assert.match(data['安徽科技学院'].find((row) => row.sourceUrl.includes('/18045.html')).description, /4人间/);
  assert.match(data['郑州澍青医学高等专科学校'].find((row) => row.sourceUrl.includes('/20253.html')).description, /郑州健康学院/);
  assert.match(data['广西卫生管理干部学院'].find((row) => row.sourceUrl.includes('/20688.html')).description, /8[–-]10人间/);
  assert.match(data['长沙社会安全职业技术学院'].find((row) => row.sourceUrl.includes('/22408.html')).description, /信息层级不同/);
});

test('twenty-seventh batch upgrades empty same-source rows with concrete third-party fields', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次二十七.json', 'utf8'));
  assert.equal(batch.length, 24);
  assert.equal(new Set(batch.map((row) => row.name)).size, 24);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing twenty-seventh batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.ok(match.occupancy || match.bedType || match.bathroom, `${item.name}: no concrete field`);
    assert.match(match.scope, /待核实/);
    assert.match(match.description, /线索/);
    assert.ok(match.description.length <= 500);
  }
  assert.match(data['中央音乐学院'].find((row) => row.sourceUrl.includes('/16187.html')).bathroom, /独立卫浴/);
  assert.match(data['北海职业学院'].find((row) => row.sourceUrl.includes('/20518.html')).bedType, /上下铺/);
});

test('twenty-eighth batch adds sushe.help public database fields as third-party leads', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次二十八.json', 'utf8'));
  assert.equal(batch.length, 147);
  assert.equal(new Set(batch.map((row) => row.name)).size, 147);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing twenty-eighth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.ok(match.occupancy || match.bedType || match.bathroom || match.campus, `${item.name}: no concrete field`);
    assert.match(match.scope, /待核实|仅供参考/);
    assert.ok(match.description.length <= 500);
  }
  assert.match(data['阜阳师范大学'].find((r) => r.sourceUrl.includes('sushe.help')).occupancy, /人间/);
});

test('twenty-ninth batch adds kaodongli public dorm pages and rejects mismatched school names', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次二十九.json', 'utf8'));
  assert.equal(batch.length, 24);
  assert.equal(new Set(batch.map((row) => row.name)).size, 24);
  assert.ok(!batch.some((row) => row.name === '太原旅游职业学院'), 'mismatched page must not be imported');
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing twenty-ninth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.ok(match.occupancy || match.bedType || match.bathroom, `${item.name}: no concrete field`);
    assert.match(match.scope, /待核实|仅供参考/);
    assert.ok(match.description.length <= 500);
  }
  assert.match(data['南京大学金陵学院'].find((r) => r.sourceUrl.includes('kaodongli')).description, /四人间|4人间/);
});

test('thirtieth batch adds slow-fetched kaodongli dorm pages with concrete fields', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次三十.json', 'utf8'));
  assert.equal(batch.length, 34);
  assert.equal(new Set(batch.map((row) => row.name)).size, 34);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing thirtieth batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.ok(match.occupancy || match.bedType || match.bathroom, `${item.name}: no concrete field`);
    assert.match(match.scope, /待核实|仅供参考/);
    assert.ok(match.description.length <= 500);
  }
  assert.equal(data['内蒙古警察职业学院'].find((r) => r.sourceUrl.includes('kaodongli')).occupancy, '六人间');
});

test('thirty-first batch continues kaodongli slow-fetch dorm pages', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次三十一.json', 'utf8'));
  assert.equal(batch.length, 19);
  assert.equal(new Set(batch.map((row) => row.name)).size, 19);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing thirty-first batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.ok(match.occupancy || match.bedType || match.bathroom, `${item.name}: no concrete field`);
    assert.match(match.scope, /待核实/);
    assert.ok(match.description.length <= 500);
  }
  assert.equal(data['内蒙古化工职业学院'].find((r) => r.sourceUrl.includes('kaodongli')).bedType, '上床下桌');
});

test('thirty-second batch maps legacy school names to current names with sourced fields', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次三十二.json', 'utf8'));
  assert.equal(batch.length, 6);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing thirty-second batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.ok(match.occupancy || match.bedType || match.bathroom, `${item.name}: no concrete field`);
    assert.match(match.description, /目录旧校名对应现名/);
    assert.match(match.scope, /待核实|仅供参考/);
  }
  assert.match(data['东华理工大学长江学院'].find((r) => r.sourceUrl.includes('kaodongli')).description, /赣东学院/);
});

test('thirty-third batch adds more kaodongli dorm pages and rejects mismatched names', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_宿舍事实批次三十三.json', 'utf8'));
  assert.equal(batch.length, 11);
  assert.ok(!batch.some((row) => row.name === '太原旅游职业学院' || row.name === '安徽职业技术学院'), 'mismatched pages must not be imported');
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing thirty-third batch source: ${item.name}`);
    assert.equal(match.sourceType, 'third_party');
    assert.ok(match.occupancy || match.bedType || match.bathroom, `${item.name}: no concrete field`);
    assert.ok(match.description.length <= 500);
  }
  assert.match(data['佛山科学技术学院'].find((r) => r.sourceUrl.includes('kaodongli')).bathroom, /独立卫浴/);
});

test('community low-trust lead batch labels leads without inventing dormitory facts', () => {
  const data = facts();
  const batch = JSON.parse(fs.readFileSync('tasks/2026-09-25_社区低可信线索批次一.json', 'utf8'));
  assert.ok(batch.length >= 100);
  for (const item of batch) {
    const match = data[item.name]?.find((row) => row.sourceType === 'community_lead' && row.sourceUrl === item.sourceUrl);
    assert.ok(match, `missing community lead: ${item.name}`);
    assert.equal(match.occupancy, '');
    assert.equal(match.bedType, '');
    assert.equal(match.bathroom, '');
    assert.match(match.scope, /线索|未核实|不代表/);
    assert.match(match.description, /低可信|线索/);
    assert.ok(match.sourceTitle && match.sourceTitle.trim());
  }
});
