const db = require("./../models");

const Token = db.token;

async function auth(req, res, next) {
	var token = req.headers.token ? req.headers.token : req.query.token;

	if(token) {
		let result = await Token.findOne({ 
			where: { 
				id: token
			}
		});

		if(result) {
			req.token = result;
			return next();
		} else {
			return res.status(401).json({
				message: "Unauthorized"
			});
		}
	} else {
		return res.status(401).json({
			message: "Unauthorized"
		});
	}

}

module.exports = auth;