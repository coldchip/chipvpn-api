const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class Device extends Model {
		static associate(models) {

		}
	}
	
	Device.init({
		id: {
			type: DataTypes.STRING,
			primaryKey: true
		},
		title: {
			type: DataTypes.STRING
		},
		address: {
			type: DataTypes.STRING
		},
		key: {
			type: DataTypes.STRING
		}
	}, {
		sequelize,
		modelName: 'device',
	});

	return Device;
};