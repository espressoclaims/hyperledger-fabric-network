var express = require('express');
var fs = require('fs');
var app = express();

var getClaims = function(id) {
	var hfc = require('fabric-client');
	var path = require('path');

	var options = {
	    wallet_path: path.join(__dirname, './creds'),
	    user_id: 'PeerAdmin',
	    channel_id: 'mychannel',
	    chaincode_id: 'fabcar',
	    network_url: 'grpc://localhost:7051',
	};

	var channel = {};
	var client = null;

	var promise = Promise.resolve().then(() => {
	    console.log("Create a client and set the wallet location");
	    client = new hfc();
	    return hfc.newDefaultKeyValueStore({ path: options.wallet_path });
	}).then((wallet) => {
	    console.log("Set wallet path, and associate user ", options.user_id, " with application");
	    client.setStateStore(wallet);
	    return client.getUserContext(options.user_id, true);
	}).then((user) => {
	    console.log("Check user is enrolled, and set a query URL in the network");
	    if (user === undefined || user.isEnrolled() === false) {
	        console.error("User not defined, or not enrolled - error");
	    }
	    channel = client.newChannel(options.channel_id);
	    channel.addPeer(client.newPeer(options.network_url));
	    return;
	}).then(() => {
	    console.log("Make query");
	    var transaction_id = client.newTransactionID();
	    console.log("Assigning transaction_id: ", transaction_id._transaction_id);

			if(id == undefined) { // queryAllClaims - requires no arguments , ex: args: ['']
				const request = {
						chaincodeId: options.chaincode_id,
						txId: transaction_id,
						fcn: 'queryAllClaims',
						args: ['']
				};
				return channel.queryByChaincode(request);
			} else { // queryClaim - requires 1 argument, ex: args: ['CAR4']
				const request = {
						chaincodeId: options.chaincode_id,
						txId: transaction_id,
						fcn: 'queryClaim',
						args: [id]
				};
				return channel.queryByChaincode(request);
			}
	}).then((query_responses) => {
	    console.log("returned from query");
			var hasPayloads = false;
			var hasErrors = false;
	    if (!query_responses.length) {
	        console.log("No payloads were returned from query");
	    } else {
					hasPayloads = true;
	        console.log("Query result count = ", query_responses.length)
	    }
	    if (query_responses[0] instanceof Error) {
					hasErrors = true;
	        console.error("error from query = ", query_responses[0]);
	    }
	    console.log("Response is ", query_responses[0].toString());

			var res = {
				hasPayloads: hasPayloads,
				hasErrors: hasErrors,
				response: query_responses[0]
			};

			return res;
	}).catch((err) => {
	    console.error("Caught Error", err);
	});

	return promise;
}

app.get('/getClaims', function(req, res) {
	var claims = getClaims();
	claims.then((_claims) => {
		if(!_claims.hasPayloads) {
			res.send("No payloads were returned from query");
		} else {
			if(_claims.hasErrors) {
				res.send("There was an error from query, and it is " + _claims.response);
			} else {
				res.send(_claims.response.toString());
			}
		}
	});
});

app.get('/getClaim/:id', function(req, res) {
	var claims = getClaims(req.params.id);
	claims.then((_claims) => {
		if(!_claims.hasPayloads) {
			res.send("No payloads were returned from query");
		} else {
			if(_claims.hasErrors) {
				res.send( _claims.response.toString());
			} else {
				res.send(_claims.response.toString());
			}
		}
	});
});

app.post('/addClaim', function(req, res) {
	res.send(req.query);
});

app.delete('/deleteClaim', function(req, res) {
	res.send(req.params);
});

var server = app.listen(8081, function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log("Example app listening at http://%s:%s", host, port);
});
