const fs   = require('fs');
const path = require('path');
const lunr = require('lunr');
const csvx = require('csv-parse');
const esql = require('sql-extra');

const COLUMNS = {code: 'TEXT', name: 'TEXT', scie: 'TEXT', desc: 'TEXT'};
const OPTIONS = {pk: 'code', index: true, tsvector: {
  code: 'A', name: 'B', scie: 'B', desc: 'B'
}};

var corpus = new Map();
var index  = null;
var ready  = null;




function csv() {
  return path.join(__dirname, 'index.csv');
}


function sqlCorpus(tab, opt) {
  return esql.setupTable(tab, COLUMNS, corpus.values(), Object.assign({}, OPTIONS, opt));
}

async function sqlCsv(tab, opt) {
  var opt    = Object.assign({}, OPTIONS, opt);
  var stream = fs.createReadStream(csv()).pipe(csvx.parse({columns: true, comment: '#'}));
  var a = esql.createTable(tab, COLUMNS, opt);
  a = await esql.insertInto.stream(tab, stream, opt, a);
  a = esql.setupTable.index(tab, COLUMNS, opt, a);
  return a;
}

async function sql(tab='descriptions', opt={}) {
  if (index) return sqlCorpus(tab, opt);
  return await sqlCsv(tab, opt);
}


function loadCorpus() {
  return new Promise((fres) => {
    var stream = fs.createReadStream(csv()).pipe(csvx.parse({columns: true, comment: '#'}));
    stream.on('data', r => corpus.set(r.code, r));
    stream.on('end', fres);
  });
}

function createIndex() {
  return lunr(function() {
    this.ref('code');
    this.field('code');
    this.field('name');
    this.field('scie');
    this.field('desc');
    for (var r of corpus.values()) {
      var {code, name, scie, desc} = r;
      name = name.replace(/^(\w+),/g, '$1 $1 $1 $1,');
      desc = desc.replace(/\[.*?\]/g, '').replace(/\w+\.\s([\w\',\/\(\)\- ]+)[;\.]?/g, '$1');
      desc = desc.replace(/[,\/\(\)\- ]+/g, ' ').trim();
      this.add({code, name, scie, desc});
    }
  });
}

async function load() {
  if (ready) await ready;
  if (index) return corpus;
  ready = loadCorpus();
  await ready;
  index = createIndex();
  return corpus;
}


function descriptions(txt) {
  if (!index) { load(); return []; }
  var a  = [], txt = txt.replace(/\W/g, ' ');
  var ms = index.search(txt), max = 0;
  for (var m of ms)
    max = Math.max(max, Object.keys(m.matchData.metadata).length);
  for (var m of ms)
    if (Object.keys(m.matchData.metadata).length===max) a.push(corpus.get(m.ref));
  return a;
}
descriptions.load = load;
descriptions.csv  = csv;
descriptions.sql  = sql;
module.exports = descriptions;
