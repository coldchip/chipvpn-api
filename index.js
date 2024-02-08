const fs = require("fs");
const express = require('express');
const db = require("./models");
const crypto = require("crypto");

const app = express();

const port = 3000;

const Device = db.device;

function dot2num(dot) {
  var d = dot.split('.');
  return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
}

function num2dot(int) {
  var part1 = int & 255;
  var part2 = ((int >> 8) & 255);
  var part3 = ((int >> 16) & 255);
  var part4 = ((int >> 24) & 255);

  return part4 + "." + part3 + "." + part2 + "." + part1;
}

async function allocate() {
  var devices = await Device.findAll({});

  var allocated = devices.map((device) => device.address);

  var start = dot2num("10.128.0.2");
  var end = dot2num("10.128.255.255");

  for(var i = start; i <= end; i++) {
    if(!allocated.includes(num2dot(i))) {
      return num2dot(i);
    }
  }

  throw "IP Pool Exhausted";
}

async function generate(path) {
  var lines = [];
  lines.push("section:device");
  lines.push(`network:10.128.0.1/16`);
  lines.push(`bind:0.0.0.0:443`);
  lines.push(`mtu:1400`);

  let devices = await Device.findAll({});
  
  for(let device of devices) {
    lines.push("section:peer");
    lines.push(`key:${device.key}`);
    lines.push(`allow:${device.address}/32`);
  }

  var config = lines.map(e => e.trim()).join("\n").trim();

  await new Promise((resolve, reject) => {
    fs.writeFile(path, config, function(err) {
      if(err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

app.get('/', async (req, res) => {
  try {
    res.status(200).json({});
  } catch(e) {
    res.status(500).json({
      error: e.toString()
    });
  }
});

app.get('/create', async (req, res) => {
  try {
    var device = await Device.create({
      title: "Device",
      key: crypto.randomBytes(32).toString('base64'),
      address: await allocate(),
    });

    await generate("/etc/chipvpn/chipvpn.ini");

    res.status(200).json({
      address: device.address,
      key: device.key
    });
  } catch(e) {
    res.status(500).json({
      error: e.toString()
    });
  }
});

(async function() {
  await db.sequelize.authenticate();
  await db.sequelize.sync();

  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })
})();