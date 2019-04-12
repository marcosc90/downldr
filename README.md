
# Downldr

A simple downloader which prevents writing invalid files:

 - Will throw an error in case of non 2xx status code
 - Allows file type filtering

## Install

```
npm install downldr
```

## API

### downldr(input, [options])

Returns a `PassThrough stream` with some extra events.

 - `complete`: When the target or piped stream is fully written.
 - `type`: Triggered when the file type is available & `filter` function is not passed or returned `true`.
 - `abort`: When the request is aborted.

#### input

Type: `string` / `object (request options)`

You can pass either an `URL` or an object that will be passed directly to [request](https://www.npmjs.com/package/request).

#### options (optional)
- `ignoreStatus` - If `true` it will ignore non `2xx` status code, defaults to `false`
- `target` - Takes a `function` or a `Writable Stream`. When passed the response will be piped into this stream. If it's a `function` the file will be passed extension if available & must return a `Writable Stream`. The function will only be executed once the download is valid: `2xx` status code & wasn't filtered by the `filter` function.

 - `filter` - which takes a `function` that should return `false` value if the download should be aborted.

This function will be triggered with the first chunk, and uses [file-type](https://www.npmjs.com/package/file-type) to detect the file type.

```javascript
function filter(type, chunk, statusCode) {
    // - type.mime may be null if `file-type` fails to detect the type
    // - type.contentType will always contain the response Conten-Type header
    // 		but the Content-Type header is not always 
    // 		accurate; A video with png extension
	return type.mime === 'image/jpeg'; // Only accepts jpeg
}
```
If the file type is not in this [list](https://www.npmjs.com/package/file-type#supported-file-types) `type.mime` will be `undefined`, but you can do the checks either using `type.contentType` or the first `chunk`

*Note*: `type.mime` may also be `undefined` for: `docx`/`pptx`/`xlsx`

> The exception is detection of `docx`, `pptx`, and `xlsx` which potentially requires reading the whole file.

```javascript
const downldr = require('downldr');

downldr('https://example.com/video.mp4')
	.on('error', console.error)
	.pipe(fs.createWriteStream('/tmp/video.mp4'))
```

## downldr().abort()

This method will abort the current download. It uses [request.abort()](https://nodejs.org/api/http.html#http_request_abort)

```javascript
const downldr = require('downldr');

const req = downldr('https://example.com/video.mp4')
	.on('error', console.error)
	.on('abort', () => console.log('Aborted!'));

req.abort();
```

## .promise(input, options)

A convenient `Promise` wrapper around `downldr`.

`options.target` is required, since `.pipe` isn't available.

```javascript
await downldr.promise('https://example.com/image', {
	filter: type => type && type.mime.startsWith('image/'),
	target: (ext) => fs.createWriteStream(`out.${ext}`)
});
```

Will `resolve` once `target` is fully written, and `reject` if an error occurs.



## Examples

### File type filter
```javascript
const downldr = require('downldr');

downldr('https://example.com/image.jpg', {
	filter: (type, chunk, statusCode) => {
		// or check the first chunk or the statusCode
		return type.mime && type.mime.startsWith('image/');			
	}
})
.on('error', console.error)
.pipe(fs.createWriteStream('/tmp/image.jpg'))
```

### Create stream on success

When saving the file to disk, a common practice is:

```javascript
read
	.pipe(fs.createWriteStream('/tmp/file.txt');
```

But if the `Readable` stream fails, we end up with an empty file. To avoid that `downldr` can take a `target` option (`function`) which will be executed only when it's time to actually write to the stream.

```javascript

downldr('https://example.com/image', {
	filter: type => type && type.mime.startsWith('image/')
	target: (ext) => fs.createWriteStream(`out.${ext}`)
})
.on('error', console.error)
.on('complete', () => console.log('done!'));
```

### Set request Content-Type
```javascript
const downldr = require('downldr');

app.get('/download/:image', (req, res) => {
	downldr(`http://example.com/${req.params.image}`, {
		filter: ({ mime = '' }) => {
		    // type.mime may be undefined for some files
		    // so we default it to = '' to safely use .startsWith
			return mime.startsWith('image/');			
		}
	})
	// 'type' is only triggered once filter returned true
	.on('type', type => res.set('Content-Type', type.mime))
	.on('error', err => {
		res.status(404)
			.send('Image not found')
	})
	.pipe(res); // Nothing will be piped if 'error' is triggered
});
```