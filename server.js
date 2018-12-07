// Shuichi Aizawa 2018 github.com/shu1
'use strict';

var https = require('https');
var express = require('express');
var app = express();
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('./.data/sqlite.db');

db.run("CREATE TABLE alphavantage(datetime TEXT NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (function, symbol))", function(err) {
	if (err) {
		console.log(err);
	} else {
		console.error("table created");
		init('TIME_SERIES_DAILY_ADJUSTED', ['FB','AAPL','AMZN','NFLX','GOOG']);
		setTimeout(init, 65000,  'DIGITAL_CURRENCY_DAILY', ['BTC','BCH','ETH','EOS','XLM']);
		setTimeout(init, 130000, 'DIGITAL_CURRENCY_DAILY', ['XMR','DASH','LTC','AMD','MSFT']);
	}
});

function init(f, s) {
	for (var i=0; i<5 && i<s.length; ++i) {
		get(f, s[i]);
	}
}

function get(f, s, res) {
	https.get("https://www.alphavantage.co/query?function=" + f + "&symbol=" + s + "&market=USD&outputsize=full&apikey=" + process.env.apikey, function(response) {
		var data = "";
		response.on('data', function(chunk) {data += chunk});
		response.on('end', function() {
			var parsed = JSON.parse(data);
			if (parsed['Meta Data']) {
				console.log(s + " insert");
				db.run("INSERT OR REPLACE INTO alphavantage(datetime, function, symbol, data) VALUES(datetime('now'), ?, ?, ?)", [f,s,data], function(err) {
					err && console.error(err);
				});
			} else {
				console.error(s + " denied");
			}
			res && res.send(data);
		});
	});
}

app.get('/', function(req, res) {
	if (!Object.keys(req.query).length) {
		res.redirect("/?stocks=FB,AAPL,AMZN,NFLX,GOOG&crypto=BTC,BCH,ETH,EOS,XLM,XMR,DASH&date=2018-08-13");
	} else {
		res.sendFile(__dirname + "/index.html");
	}
});

app.get('/all', function(req, res) {
	db.all("SELECT symbol, datetime FROM alphavantage ORDER BY datetime", function(err, rows) {
		if (err) {
			res.send(err);
		} else {
			res.send(rows);
		}
	});
});

app.get('/crons', function(req, res) {
	var date = new Date();
	date.setHours(0,3,0);
	cron('TIME_SERIES_DAILY_ADJUSTED', date.toISOString(), 10000000, res);
});

app.get('/cronc', function(req, res) {
	var date = new Date();
	date.setHours(1,33,0);
	cron('DIGITAL_CURRENCY_DAILY', date.toISOString(), 10000000, res);
});

function cron(f, time, prev, res) {
	console.log("cron " + f + " " + prev);
	db.all("SELECT function, symbol FROM alphavantage WHERE function = ? AND datetime(datetime) < datetime(?) ORDER BY datetime", [f,time], function(err, rows) {
		if (err) {
			console.error(err);
			res && res.send(err);
		} else {
			for (var i=0; i<5 && i<rows.length; ++i) {
				get(rows[i].function, rows[i].symbol);
			}
			res && res.send(rows);

			if (rows.length > 5 && rows.length < prev) {
				setTimeout(cron, 65000, f, time, rows.length);
			}
		}
	});
}

app.get('/query', function(req, res) {
	db.get("SELECT data FROM alphavantage WHERE function = ? AND symbol = ?", [req.query.function, req.query.symbol], function(err, row) {
		if (err) {
			console.error(err);
		}
		else if (row) {

			console.log(req.query.symbol + " in db");
			res.send(row.data);
		} else {
			get(req.query.function, req.query.symbol, res);
		}
	});
});

var listener = app.listen(process.env.PORT, function() {
	console.log("listening on " + listener.address().port);
});
