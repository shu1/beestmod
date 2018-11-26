// Shuichi Aizawa 2018 github.com/shu1
"use strict";

const express = require('express');
const PORT = process.env.PORT || 5000;
const {Pool} = require('pg');
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: true
});

express()
	.get('/', (req, res) => res.sendFile(__dirname + '/index.html'))
	.get('/all', async (req, res) => {
		try {
			const client = await pool.connect();
			const result = await client.query('SELECT * FROM alphavantage');
			res.send(result);
			client.release();
		} catch (err) {
			res.send(err);
		}
	})
	.get('/create', async (req, res) => {
		try {
			const client = await pool.connect();
			const result = await client.query("CREATE TABLE IF NOT EXISTS alphavantage(datetime TIMESTAMPTZ NOT NULL, function TEXT NOT NULL, symbol TEXT NOT NULL, json TEXT NOT NULL)");
			res.send(result);
			client.release();
		} catch (err) {
			res.send(err);
		}
	})
	.get('/cron', async (req, res) => {
		try {
			const client = await pool.connect();
			const result = await client.query("SELECT function, symbol FROM alphavantage WHERE date_trunc('day', datetime) < CURRENT_DATE ORDER BY datetime");
			for (var i=0; i<5 && i<result.rowCount; ++i) {
				console.log("cron " + result.rows[i].symbol);
				get(client, result.rows[i].function, result.rows[i].symbol, true);
			}
			res.send(result);
			client.release();
		} catch (err) {
			res.send(err);
		}
	})
	.get('/query', async (req, res) => {
		try {
			var client = await pool.connect();
			var result = await client.query("SELECT * FROM alphavantage WHERE function = $1 AND symbol = $2", [req.query.function, req.query.symbol]);

			if (result && result.rowCount > 0) {
				if (result.rowCount > 1) {
					console.error(req.query.symbol + " rows " + result.rows.length);
				}

				var row = result.rows[result.rowCount-1];
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
			}

			if (!row || row == "update") {
				console.log(req.query.symbol + " get");
				get(client, req.query.function, req.query.symbol, row == "update", res);
			}

			client.release();
		} catch (error) {
			console.error(error);
			res.send(error);
		}
	})
	.listen(PORT, () => console.log(`Listening on ${ PORT }`))

function get(client, f, s, update, res) {
	var https = require('https');
	https.get("https://www.alphavantage.co/query?function=" + f + "&symbol=" + s + "&market=USD&apikey=" + process.env.apikey, function(res2) {
		var data = '';
		res2.on('data', function(chunk) {data += chunk});
		res2.on('end', function() {
			var parsed = JSON.parse(data);
			if (parsed['Meta Data']) {
				if (update) {
					var query = "UPDATE alphavantage SET datetime = NOW(), json = $1 WHERE function = $2 AND symbol = $3";
					console.log(s + " update");
				} else {
					var query = "INSERT INTO alphavantage(datetime, json, function, symbol) VALUES(NOW(), $1, $2, $3)";
					console.log(s + " insert");
				}

				client.query(query, [data,f,s], function(err, res) {
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
