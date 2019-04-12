'use strict';

const request = require('request');
const fileType = require('file-type');
const { PassThrough } = require('stream');

const getTypeAndFilter = (chunk, response, options) => {

	const { statusCode } = response;

	if(options.ignoreStatus !== true && (statusCode < 200 || statusCode >= 300)) {
		return response.destroy(
			new Error(`Request failure: ${response.statusCode} status`)
		);
	}

	// check magic number
	const type = Object.assign({
		contentType: response.headers['content-type']
	}, fileType(chunk) || {});

	if(options.filter && options.filter(type, chunk, statusCode) === false) {
		return response.destroy(
			new Error(`Invalid type: ${type.mime || type.contentType} - Status Code: ${statusCode}`)
		);
	}

	return type;

};

const handleChunk = (stream, response, options) => chunk => {
	response.pause();

	const type = getTypeAndFilter(chunk, response, options);

	if(!type)
		return;

	// As soon as we know that the file is valid
	// emit type in case you need to set the Content-Type of the request
	stream.emit('type', type);

	// Unshift the chunk, so we can pipe correctly without loosing the first chunk
	response.unshift(chunk);

	let piped = response.pipe(stream);

	const target = typeof options.target === 'function' ? options.target(type.ext) : options.target;

	if(target)
		piped = stream.pipe(target);

	piped.on('finish', () => stream.emit('complete'));

};

const downldr = (url, options = {}) => {
	const stream = new PassThrough();

	const handleError = err => stream.emit('error', err);

	const req = request(url)
		.on('error', handleError)
		.on('response', response => {
			response.on('error', handleError);
			response.once('data', handleChunk(stream, response, options));
		});

	req.on('abort', () => stream.emit('abort'));
	stream.abort = () => req.abort();

	return stream;
};

downldr.promise = (...args) => {

	return new Promise((resolve, reject) => {

		downldr(...args)
			.on('complete', resolve)
			.on('error', reject);
	});
};


module.exports = downldr;
