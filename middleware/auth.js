const db = require("./../models");

const Token = db.token;

async function auth(req, res, next) {
	var token = req.headers.authorization ? req.headers.authorization : req.query.authorization;

	if(token) {
		let result = await Token.findOne({ 
			where: { 
				id: token
			}
		});

		if(result) {
			req.token = result;
			return next();
		}
	} 
	
	return res.status(401).json({
		message: "unauthorized"
	});

}

module.exports = auth;