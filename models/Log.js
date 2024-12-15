const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class Log extends Model {
		static associate(models) {

		}
	}
	
	Log.init({
		deviceId: {
			type: DataTypes.STRING
		},
		type: {
			type: DataTypes.STRING
		},
		timestamp: {
			type: DataTypes.INTEGER
		},
		tx: {
			type: DataTypes.INTEGER
		},
		rx: {
			type: DataTypes.INTEGER
		}
	}, {
		sequelize,
		modelName: 'log',
	});

	return Log;
};