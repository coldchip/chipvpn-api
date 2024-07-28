const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class Device extends Model {
		static associate(models) {

		}
	}
	
	Device.init({
		title: {
			type: DataTypes.STRING
		},
		address: {
			type: DataTypes.STRING
		},
		key: {
			type: DataTypes.STRING
		},
		tx: {
			type: DataTypes.INTEGER
		},
		rx: {
			type: DataTypes.INTEGER
		}
	}, {
		sequelize,
		modelName: 'device',
	});

	return Device;
};