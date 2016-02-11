"use strict";

const fs = require('fs');
const util = require('util');

const r = /\[(.+?)] ([^[]+) - ([0-9a-zA-Z\.]+)/;

// Create the anime list with `find -type f -print0 | xargs -0 basename -a | sort > ~/anime_list`
const b = fs.readFileSync('./anime_list', 'utf8')
.trim()
.split('\n')
.map(a => {
  const aa = r.exec(a);
  return {
    originalFileName: a,
    groupName: aa[1],
    showName: aa[2],
    episode: parseInt(aa[3])
   };
});

console.log(util.inspect(b, { colors: true }));
