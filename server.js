// Shuichi Aizawa 2018

var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('./.data/sqlite.db');
var listener = app.listen(process.env.PORT, function() {
	console.log('listening on port ' + listener.address().port);
});

db.run("CREATE TABLE alphavantage(datetime TEXT NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, market TEXT, json TEXT NOT NULL)", function(err) {
	if (err) {
		console.log(err);
	} else {
		console.error("table created");
	}
});

app.get('/', function(request, response) {
	response.sendFile(__dirname + '/views/index.html');
});

app.get('/all', function(request, response) {
	db.all("SELECT * FROM alphavantage", function(err, rows) {
		if (err) console.error(err);
		response.send(rows);
	});
});

var https = require('https');
app.get('/query', function(request, response) {
	if (request.query && request.query.function && request.query.symbol) {
		var f = request.query.function;
		var s = request.query.symbol;

		db.get("SELECT * FROM alphavantage WHERE function = ? AND symbol = ?", [f, s], function(err, row) {
			if (err) console.error(err);

			if (row) {
				var date = new Date(row.datetime);
				var now = new Date();	// must be UTC
				console.log(s + " in db from " + row.datetime);

				if (now.getFullYear() > date.getFullYear()) {
					row = "update";
				}
				else if (now.getMonth() > date.getMonth()) {
					row = "update";
				}
				else if (now.getDate() > date.getDate()) {
					row = "update";
				}
				else {
					response.send(JSON.parse(row.json));
				}
			}

			if (!row || row == "update") {
				console.log(s + " request");
				https.get("https://www.alphavantage.co/query?function=" + f + "&symbol=" + s + "&market=CNY&apikey=" + process.env.apikey, function(res) {
					var data = '';
					res.on('data', function(chunk) {data += chunk});
					res.on('end', function() {
						var parsed = JSON.parse(data);
						if (parsed["Meta Data"]) {
							var query = "INSERT INTO alphavantage(datetime, json, function, symbol) VALUES(datetime('now'), ?, ?, ?)";
							if (row == "update") {
								query = "UPDATE alphavantage SET datetime = datetime('now'), json = ? WHERE function = ? AND symbol = ?"
								console.log(s + " update");
							} else {
								console.log(s + " insert");
							}

							db.run(query, [data, f, s], function(err) {
								if (err) console.error(err);
							});
						} else {
							console.error(s + " denied");
							console.log(parsed);
						}
						response.send(parsed);
					});
				});
			}
		});
	} else {
		response.send("");
	}
});
