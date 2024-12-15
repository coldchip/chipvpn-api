const fs = require("fs");
const express = require('express');
const db = require("./models");
const { Op } = require('sequelize');
const crypto = require("crypto");
const bodyParser = require("body-parser");

const app = express();

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }));

const port = 3000;

const Device = db.device;
const Log = db.log;

const config = {
  address: "10.128.0.1",
  prefix: 16,
  mtu: 1420,
  server: {
    address: "45.32.100.13",
    port: 443
  },
  bind: {
    address: "0.0.0.0",
    port: 443
  }
};

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

function cidr2subnet(bitCount) {
  var mask = [], i, n;
  for(i=0; i<4; i++) {
    n = Math.min(bitCount, 8);
    mask.push(256 - Math.pow(2, 8-n));
    bitCount -= n;
  }
  return mask.join('.');
}

async function allocate() {
  var devices = await Device.findAll({});
  var allocated = devices.map((device) => device.address);

  var start = dot2num(config.address) & dot2num(cidr2subnet(config.prefix));
  var end   = dot2num(config.address) | (~dot2num(cidr2subnet(config.prefix)));

  for(var i = (start + 1); i <= (end - 1); i++) {
    if(!allocated.includes(num2dot(i)) && i != dot2num(config.address)) {
      return num2dot(i);
    }
  }

  throw new Error("IP Pool Exhausted");
}

async function save(path) {
  var lines = [];
  lines.push("section:device");
  lines.push(`network:${config.address}/${config.prefix}`);
  lines.push(`bind:${config.bind.address}:${config.bind.port}`);
  lines.push(`mtu:${config.mtu}`);
  lines.push("\n\n");

  let devices = await Device.findAll({});
  
  for(let device of devices) {
    lines.push("section:peer");
    lines.push(`key:${device.key}`);
    lines.push(`allow:${device.address}/32`);
    lines.push(`onconnect:curl -X GET "http://127.0.0.1:${port}/accounting/?id=${device.id}&action=connect&tx=%tx%&rx=%rx%" &`);
    lines.push(`onping:curl -X GET "http://127.0.0.1:${port}/accounting/?id=${device.id}&action=ping&tx=%tx%&rx=%rx%" &`);
    lines.push(`ondisconnect:curl -X GET "http://127.0.0.1:${port}/accounting/?id=${device.id}&action=disconnect&tx=%tx%&rx=%rx%" &`);
    lines.push("\n\n");
  }

  var output = lines.map(e => e.trim()).join("\n").trim().concat('\n');

  // console.log(output);

  await new Promise((resolve, reject) => {
    fs.writeFile(path, output, function(err) {
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
  var tx = parseInt(req.query.tx);
  var rx = parseInt(req.query.rx);

  await Device.update({
    expiry: Math.floor(new Date().getTime() / 1000) + 120
  }, {
    where: {
      id: req.query.id,
    },
  });

  await Log.create({
    deviceId: req.query.id,
    type: req.query.action,
    timestamp: Math.floor(new Date().getTime() / 1000),
    tx: tx, 
    rx: rx
  });

  res.status(200).json({});
});

app.get('/log', async (req, res) => {
  var logs = await Log.findAll({
    where: {
      timestamp: {
        [Op.gt]: Math.floor(new Date().getTime() / 1000) - 86400,          
      }
    }
  });

  res.status(200).json(logs);
});

app.delete('/log', async (req, res) => {
  await Log.destroy();

  res.status(200).json({});
});

app.post('/', async (req, res) => {
  try {

    let ephemeral = req.body.ephemeral;

    var device = await Device.create({
      ephemeral: ephemeral ? true : false,
      expiry: Math.floor(new Date().getTime() / 1000) + 120,
      title: "Device",
      key: crypto.randomBytes(16).toString('hex'),
      address: await allocate()
    });

    res.status(200).json({
      address: device.address,
      prefix: config.prefix,
      gateway: config.address,
      mtu: config.mtu,
      server: config.server.address,
      port: config.server.port,
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
    console.log(`ChipVPN API listening on port ${port}`)
  });


  async function heartbeat() {

    await Device.destroy({
      where: {
        ephemeral: true,
        expiry: {
          [Op.lt]: Math.floor(new Date().getTime() / 1000),          
        }
      }
    });

    await save("/etc/chipvpn/chipvpn.ini");

    setTimeout(heartbeat, 1000);
  }

  heartbeat();
})();