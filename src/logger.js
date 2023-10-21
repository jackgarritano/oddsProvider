import bunyan from 'bunyan';

const log = bunyan.createLogger({
	name: 'pollGames',
	level: 'debug',
	serializers: bunyan.stdSerializers,
});

export default log;