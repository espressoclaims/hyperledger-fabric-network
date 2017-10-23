var express = require('express');
var fs = require('fs');
var cors = require('cors');
var bodyParser = require('body-parser');
var app = express();

app.use(cors());
app.use(bodyParser.json());

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

var createClaim = function(servicePerformed, serviceProviderId, employerNo, employeeNo, isClaimable, amount) {
	var hfc = require('fabric-client');
	var path = require('path');
	var util = require('util');

	var options = {
	    wallet_path: path.join(__dirname, './creds'),
	    user_id: 'PeerAdmin',
	    channel_id: 'mychannel',
	    chaincode_id: 'fabcar',
	    peer_url: 'grpc://localhost:7051',
	    event_url: 'grpc://localhost:7053',
	    orderer_url: 'grpc://localhost:7050'
	};

	var channel = {};
	var client = null;
	var targets = [];
	var tx_id = null;
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
	    var peerObj = client.newPeer(options.peer_url);
	    channel.addPeer(peerObj);
	    channel.addOrderer(client.newOrderer(options.orderer_url));
	    targets.push(peerObj);
	    return;
	}).then(() => {
			var uuid = require('uuid/v4');
	    tx_id = client.newTransactionID();
	    console.log("Assigning transaction_id: ", tx_id._transaction_id);
	    // createClaim - requires 5 args, ex: args: ['CLAIM11', '123adf', 'ews34124', 'af1111', '1111'],
	    // changeCarOwner - requires 2 args , ex: args: ['CAR10', 'Barry'],
	    // send proposal to endorser
	    var request = {
	        targets: targets,
	        chaincodeId: options.chaincode_id,
	        fcn: 'createClaim',
	        args: [uuid(), servicePerformed, serviceProviderId, employerNo, employeeNo, isClaimable.toString(), amount.toString()],
	        chainId: options.channel_id,
	        txId: tx_id
	    };
	    return channel.sendTransactionProposal(request);
	}).then((results) => {
	    var proposalResponses = results[0];
	    var proposal = results[1];
	    var header = results[2];
	    let isProposalGood = false;
	    if (proposalResponses && proposalResponses[0].response &&
	        proposalResponses[0].response.status === 200) {
	        isProposalGood = true;
	        console.log('transaction proposal was good');
	    } else {
	        console.error('transaction proposal was bad');
	    }
	    if (isProposalGood) {
	        console.log(util.format(
	            'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
	            proposalResponses[0].response.status, proposalResponses[0].response.message,
	            proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
	        var request = {
	            proposalResponses: proposalResponses,
	            proposal: proposal,
	            header: header
	        };
	        // set the transaction listener and set a timeout of 30sec
	        // if the transaction did not get committed within the timeout period,
	        // fail the test
	        var transactionID = tx_id.getTransactionID();
	        var eventPromises = [];
	        let eh = client.newEventHub();
	        eh.setPeerAddr(options.event_url);
	        eh.connect();

	        let txPromise = new Promise((resolve, reject) => {
	            let handle = setTimeout(() => {
	                eh.disconnect();
	                reject();
	            }, 30000);

	            eh.registerTxEvent(transactionID, (tx, code) => {
	                clearTimeout(handle);
	                eh.unregisterTxEvent(transactionID);
	                eh.disconnect();

	                if (code !== 'VALID') {
	                    console.error(
	                        'The transaction was invalid, code = ' + code);
	                    reject();
	                } else {
	                    console.log(
	                        'The transaction has been committed on peer ' +
	                        eh._ep._endpoint.addr);
	                    resolve();
	                }
	            });
	        });
	        eventPromises.push(txPromise);
	        var sendPromise = channel.sendTransaction(request);
	        return Promise.all([sendPromise].concat(eventPromises)).then((results) => {
	            console.log(' event promise all complete and testing complete');
	            return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
	        }).catch((err) => {
	            console.error(
	                'Failed to send transaction and get notifications within the timeout period.'
	            );
	            return 'Failed to send transaction and get notifications within the timeout period.';
	        });
	    } else {
	        console.error(
	            'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...'
	        );
	        return 'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...';
	    }
	}, (err) => {
	    console.error('Failed to send proposal due to error: ' + err.stack ? err.stack :
	        err);
	    return 'Failed to send proposal due to error: ' + err.stack ? err.stack :
	        err;
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
	if(Object.keys(req.body).length != 6) {
		res.status(400).send("Claim does not have all required information.");
	}

	var servicePerformed = req.body["servicePerformed"];
	var serviceProviderId = req.body["serviceProviderId"];
	var employerNo = req.body["employerNo"];
	var employeeNo = req.body["employeeNo"];
	var isClaimable = req.body["isClaimable"];
	var amount = req.body["amount"];

	if(servicePerformed == undefined) {
		res.status(400).send("Missing: servicePerformed");
	} else if(serviceProviderId == undefined) {
		res.status(400).send("Missing: serviceProviderId");
	} else if(employerNo == undefined) {
		res.status(400).send("Missing: employerNo");
	} else if(employeeNo == undefined) {
		res.status(400).send("Missing: employeeNo");
	} else if(amount == undefined) {
		res.status(400).send("Missing: amount");
	} else if(isClaimable == undefined) {
		res.status(400).send("Missing: isClaimable");
	} else {
		createClaim(servicePerformed, serviceProviderId, employerNo, employeeNo, isClaimable, amount).then((response) => {
			if (response.status === 'SUCCESS') {
				res.send("SUCCESS: sent transaction to the orderer");
			} else {
				res.status(500).send("FAILURE: could not order transaction due to error: " + response.status);
			}
		}, (err) => {
			res.status(500).send("FAILURE: could not send transaction due to error: " +  + err.stack ? err.stack :
			    err);
		});
	}
});

app.delete('/deleteClaim', function(req, res) {
	res.send(req.params);
});

var server = app.listen(8081, function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log("Example app listening at http://%s:%s", host, port);
});
