require('dotenv').config();
const fs = require("fs");
const express = require('express');
const db = require("./models");
const { Op } = require('sequelize');
const crypto = require("crypto");
const bodyParser = require("body-parser");
const auth = require("./middleware/auth");

const app = express();

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }));

const port = 3000;

const Token = db.token;
const Device = db.device;

const config = {
  address: "10.128.0.1",
  prefix: 16,
  mtu: 1370,
  server: {
    address: process.env.address ? process.env.address : "127.0.0.1",
    port: process.env.port ? parseInt(process.env.port) : 443
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

  throw new Error("ip pool exhausted");
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
    lines.push(`onconnect:curl -X POST "http://127.0.0.1:${port}/coordination/?id=${device.id}&action=connect&address=%paddr%&port=%pport%" &`);
    // lines.push(`onping:curl -X POST "http://127.0.0.1:${port}/accounting/?id=${device.id}&action=ping&tx=%tx%&rx=%rx%" &`);
    lines.push(`ondisconnect:curl -X POST "http://127.0.0.1:${port}/coordination/?id=${device.id}&action=disconnect&address=%paddr%&port=%pport%" &`);
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

app.get('/', async (req, res) => {
  res.status(200).json({});
});

app.get('/session/', auth, async (req, res) => {
  try {
    var devices = await Device.findAll({
      where: {
        tokenId: req.token.id
      }
    });

    res.status(200).json(devices);
  } catch(e) {
    res.status(500).json({
      error: e.toString()
    });
  }
});

// app.get('/accounting', async (req, res) => {
//   var tx = parseInt(req.query.tx);
//   var rx = parseInt(req.query.rx);

//   res.status(200).json({});
// });

var mesh = [];

app.post('/session/', auth, async (req, res) => {
  try {
    await Device.destroy({
      where: {
        tokenId: req.token.id
      }
    });
    
    var device = await Device.create({
      key: crypto.randomBytes(16).toString('hex'),
      address: await allocate(),
      tokenId: req.token.id
    });

    mesh = [];
    var devices = await Device.findAll();
    for (let i = 0; i < devices.length; i++) {
      for (let j = i + 1; j < devices.length; j++) {
        const node1 = devices[i];
        const node2 = devices[j];

        mesh.push({
          mapping: [node1.id, node2.id],
          key: crypto.randomBytes(16).toString('hex')
        });
      }
    }
    
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

app.get('/coordination/', auth, async (req, res) => {
  try {

    var device = await Device.findOne({
      where: {
        tokenId: req.token.id
      }
    });

    var nodes = mesh.filter((node) => node.mapping.includes(device.id));
    for(let node of nodes) {
      var peerId = node.mapping.find((map) => map != device.id);

      var peer = await Device.findOne({
        where: {
          id: peerId
        }
      });

      node.address = peer.sessionAddress;
      node.port = peer.sessionPort;
      delete node.mapping;
    }
    
    res.status(200).json(nodes);
  } catch(e) {
    res.status(500).json({
      error: e.toString()
    });
  }
});

app.post('/coordination/', async (req, res) => {
  try {
    var device = await Device.update({ 
        sessionAddress: req.query.address,
        sessionPort: req.query.port
    }, {
      where: {
        id: req.query.id
      }
    });
    
    res.status(200).json({});
  } catch(e) {
    res.status(500).json({
      error: e.toString()
    });
  }
});

app.delete('/session/:id', auth, async (req, res) => {
  try {
    var success = await Device.destroy({
      where: {
        id: req.params.id,
        tokenId: req.token.id
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

  for(let i = 0; i < 9; i++) {
    await Token.findOrCreate({
      where: {
        id: "ryan88800" + i.toString()
      },
      defaults: {
        id: "ryan88800" + i.toString()
      }
    });
  }

  async function heartbeat() {

    // await Device.destroy({
    //   where: {
    //     ephemeral: true,
    //     expiry: {
    //       [Op.lt]: Math.floor(new Date().getTime() / 1000),          
    //     }
    //   }
    // });

    await save("/etc/chipvpn/chipvpn.ini");

    setTimeout(heartbeat, 1000);
  }

  heartbeat();
})();