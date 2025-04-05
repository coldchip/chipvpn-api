const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class Device extends Model {
		static associate(models) {
			Device.belongsTo(models.token);
		}
	}
	
	Device.init({
		address: {
			type: DataTypes.STRING
		},
		key: {
			type: DataTypes.STRING
		},
		sessionAddress: {
			type: DataTypes.STRING
		},
		sessionPort: {
			type: DataTypes.INTEGER
		}
	}, {
		sequelize,
		modelName: 'device',
	});

	return Device;
};