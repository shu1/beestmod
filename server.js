// Shuichi Aizawa 2018 github.com/shu1
"use strict";

var https = require("https");
var express = require("express");
var app = express();
var {Pool} = require("pg");
var pool = new Pool({connectionString:process.env.DATABASE_URL, ssl:true});

pool.query("CREATE TABLE alphavantage(datetime TIMESTAMPTZ NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(function, symbol))", function(err, result) {
	if (err) {
		console.log(err);
	} else {
		console.warn("table created");
		init("TIME_SERIES_DAILY_ADJUSTED", ["FB","AAPL","AMZN","NFLX","GOOG"]);
		setTimeout(init, 65000, "DIGITAL_CURRENCY_DAILY", ["BTC","BCH","ETH","EOS","XLM"]);
		setTimeout(init, 130000, "DIGITAL_CURRENCY_DAILY", ["XMR","DASH","LTC","XRP","ETC"]);
	}
})

function init(f, s) {
	for (var i=0; i<s.length; ++i) {
		get(f, s[i]);
	}
}

app.get("/get", function(req, res) {
	get(req.query.function, req.query.symbol, res);
})

function get(f, s, res) {
	https.get("https://www.alphavantage.co/query?function=" + f + "&symbol=" + s + "&market=USD&outputsize=full&apikey=" + process.env.apikey, function(response) {
		var data = "";
		response.on("data", function(chunk) {data += chunk});
		response.on("end", function() {
			var parsed = JSON.parse(data);
			if (parsed["Meta Data"]) {
				console.log(s, "insert");
				pool.query("INSERT INTO alphavantage(datetime, function, symbol, data) VALUES(NOW(), $1, $2, $3) ON CONFLICT(function, symbol) DO UPDATE SET datetime = NOW(), data = $3", [f,s,data], function(err, result) {
					err && console.error(err);
				})
			} else {
				console.warn(s, "denied");
			}
			res && res.send(data);
		})
	})
}

app.get("/", function(req, res) {
	if (!Object.keys(req.query).length) {
		res.redirect("/?stocks=FB,AAPL,AMZN,NFLX,GOOG&crypto=BTC,BCH,ETH,EOS,XLM,XMR,DASH&date=2018-08-13");
	} else {
		res.sendFile(__dirname + "/index.html");
	}
})

app.get("/all", function(req, res) {
	pool.query("SELECT symbol, datetime FROM alphavantage ORDER BY datetime", function(err, result) {
		if (err) {
			res.send(err);
		} else {
			res.send(result);
		}
	})
})

app.get("/one", function(req, res) {
	pool.query("SELECT * FROM alphavantage WHERE function=$1 AND symbol=$2", [req.query.function, req.query.symbol], function(err, result) {
		if (err) {
			res.send(err);
		} else {
			res.send(result);
		}
	})
})

app.get("/delete", function(req, res) {
	pool.query("DELETE FROM alphavantage WHERE function=$1 AND symbol=$2", [req.query.function, req.query.symbol], function(err, result) {
		if (err) {
			res.send(err);
		} else {
			console.warn(req.query.symbol, "deleted");
			res.send(result);
		}
	})
})

app.get("/cron", function(req, res) {
	var date = new Date();
	if (req.query.h && req.query.m) {
		date.setHours(req.query.h, req.query.m, 0);
	}
	cron(req.query.f=="c"?"DIGITAL_CURRENCY_DAILY":"TIME_SERIES_DAILY_ADJUSTED", date.toISOString(), 10000000, res);
})

function cron(f, time, prev, res) {
	console.log("cron", f, prev);
	pool.query("SELECT function, symbol FROM alphavantage WHERE function=$1 AND datetime<$2 ORDER BY datetime", [f, time], function(err, result) {
		if (err) {
			console.error(err);
			res && res.status(500).send(err);
		} else {
			for (var i=0; i<5 && i<result.rowCount; ++i) {
				get(result.rows[i].function, result.rows[i].symbol);
			}
			res && res.send(result);

			if (result.rowCount > 5 && result.rowCount < prev) {
				setTimeout(cron, 65000, f, time, result.rowCount);
			}
		}
	})
}

app.get("/query", function(req, res) {
	pool.query("SELECT data FROM alphavantage WHERE function=$1 AND symbol=$2", [req.query.function, req.query.symbol], function(err, result) {
		if (err) {
			console.error(err);
		}
		else if (result && result.rowCount > 0) {
			var row = result.rows[0];
			console.log(req.query.symbol, "in db");
			res.send(row.data);
		} else {
			get(req.query.function, req.query.symbol, res);
		}
	})
})

var listener = app.listen(process.env.PORT, function() {
	console.log("app is listening on", listener.address().port);
})
