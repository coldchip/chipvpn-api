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

  throw new Error("IP Pool Exhausted");
}

async function save(path) {
  var lines = [];
  lines.push("section:device");
  lines.push(`network:10.128.0.1/16`);
  lines.push(`bind:0.0.0.0:443`);
  lines.push(`mtu:1400`);
  lines.push(`xor:6Gk5dgBudKKffdBtWJX8bUeZ7o6V7kn5`);

  let devices = await Device.findAll({});
  
  for(let device of devices) {
    lines.push("section:peer");
    lines.push(`key:${device.key}`);
    lines.push(`allow:${device.address}/32`);
    lines.push(`onconnect:curl -X GET "http://127.0.0.1:${port}/accounting/?id=${device.id}&action=connect&tx=%tx%&rx=%rx%" &`);
    lines.push(`onping:curl -X GET "http://127.0.0.1:${port}/accounting/?id=${device.id}&action=ping&tx=%tx%&rx=%rx%" &`);
    lines.push(`ondisconnect:curl -X GET "http://127.0.0.1:${port}/accounting/?id=${device.id}&action=disconnect&tx=%tx%&rx=%rx%" &`);
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

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  next();
});

var sessions = {};

app.get('/', async (req, res) => {
  try {
    var devices = await Device.findAll({});

    res.status(200).json(devices);
  } catch(e) {
    res.status(500).json({
      error: e.toString()
    });
  }
});

app.get('/accounting', async (req, res) => {
  if(sessions[req.query.id]) {
    var dtx = parseInt(req.query.tx) - sessions[req.query.id].tx;
    var drx = parseInt(req.query.rx) - sessions[req.query.id].rx;

    sessions[req.query.id].tx += dtx;
    sessions[req.query.id].rx += drx;

    var device = await Device.findOne({ 
      where: { 
        id: req.query.id
      } 
    });

    await Device.update({ 
      tx: device.tx + dtx, 
      rx: device.rx + drx
    }, {
      where: {
        id: req.query.id,
      },
    });
  }

  switch(req.query.action) {
    case "connect": {
      sessions[req.query.id] = {
        tx: 0,
        rx: 0
      };
    }
    break;
    case "disconnect": {
      delete sessions[req.query.id];
    }
    break;
  }

  res.status(200).json(device);
});

app.post('/', async (req, res) => {
  try {
    var device = await Device.create({
      title: "Device",
      key: crypto.randomBytes(32).toString('base64'),
      address: await allocate(),
      tx: 0,
      rx: 0
    });

    await save("/etc/chipvpn/chipvpn.ini");

    res.status(200).json({
      id: device.id,
      address: device.address,
      key: device.key
    });
  } catch(e) {
    res.status(500).json({
      error: e.toString()
    });
  }
});

app.delete('/:id', async (req, res) => {
  try {
    var success = await Device.destroy({
      where: {
        id: req.params.id
      }
    });

    await save("/etc/chipvpn/chipvpn.ini");

    if(success) {
      res.status(200).json({});
    } else {
      res.status(404).json({
        error: "Record not found"
      });
    }
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
  });


  // async function heartbeat() {
  //   console.log(sessions);
  //   setTimeout(heartbeat, 100);
  // }

  // heartbeat();
})();