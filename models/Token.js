const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class Token extends Model {
		static associate(models) {
			Token.hasMany(models.token);
		}
	}
	
	Token.init({
		id: {
			type: DataTypes.STRING,
			primaryKey: true
		}
	}, {
		sequelize,
		modelName: 'token',
	});

	return Token;
};