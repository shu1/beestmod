// Shuichi Aizawa 2018 github.com/shu1
"use strict";

var express = require('express');
var app = express();
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('./.data/sqlite.db');
var listener = app.listen(process.env.PORT, function() {
	console.log('listening on port ' + listener.address().port);
});

db.run("CREATE TABLE alphavantage(datetime TEXT NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, json TEXT NOT NULL)", function(err) {
	if (err) {
		console.log(err);
	} else {
		console.error("table created");
	}
});

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/index.html');
});

app.get('/all', function(req, res) {
	db.all("SELECT symbol, datetime FROM alphavantage", function(err, rows) {
		if (err) console.error(err);
		res.send(rows);
	});
});

app.get('/cron', function(req, res) {
	db.all("SELECT function, symbol FROM alphavantage WHERE date(datetime) < date('now') ORDER BY datetime", function(err, rows) {
		if (err) console.error(err);
		for (var i=0; i<5 && i<rows.length; ++i) {
			console.log("cron " + rows[i].symbol);
			get(rows[i].function, rows[i].symbol, true);
		}
		res.send(rows);
	});
});

app.get('/query', function(req, res) {
	db.get("SELECT * FROM alphavantage WHERE function = ? AND symbol = ?", [req.query.function, req.query.symbol], function(err, row) {
		if (err) console.error(err);

		if (row) {
			var date = new Date(row.datetime);
			var now = new Date();	// must be UTC
			console.log(req.query.symbol + " " + row.datetime);

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
				res.send(JSON.parse(row.json));
			}
		}

		if (!row || row == "update") {
			console.log(req.query.symbol + " get");
			get(req.query.function, req.query.symbol, row == "update", res);
		}
	});
});

function get(f, s, update, res) {
	var https = require('https');
	https.get("https://www.alphavantage.co/query?function=" + f + "&symbol=" + s + "&market=USD&apikey=" + process.env.apikey, function(res2) {
		var data = '';
		res2.on('data', function(chunk) {data += chunk});
		res2.on('end', function() {
			var parsed = JSON.parse(data);
			if (parsed['Meta Data']) {
				if (update) {
					var query = "UPDATE alphavantage SET datetime = datetime('now'), json = ? WHERE function = ? AND symbol = ?";
					console.log(s + " update");
				} else {
					var query = "INSERT INTO alphavantage(datetime, json, function, symbol) VALUES(datetime('now'), ?, ?, ?)";
					console.log(s + " insert");
				}

				db.run(query, [data,f,s], function(err) {
					if (err) console.error(err);
				});
			} else {
				console.error(s + " denied");
				console.log(parsed);
			}

			if (res) res.send(parsed);
		});
	});
}
