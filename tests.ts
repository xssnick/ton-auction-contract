import { SmartContract, OutAction } from "ton-contract-executor";
import { Cell, InternalMessage, CommonMessageInfo, CellMessage, Address, Builder, toNano ,Slice} from "ton";

const me = Address.parse('EQCJI5UGnZtUsIAMPN4Hq8K9XlSD9bi2OQO_10DgawpOjQbF');

const marketplace = Address.parse('EQAoIh2-5Ss-I19dGzPe5C1cmDBHeUN8_rvGKJnEmnAOcXxF');
const fee = Address.parse('EQBFphGIlhpQvLlai7i9dxIt3zSvf5z5619LulH_Evi570J-');
const nft = Address.parse('EQDEGeK4o7bNgazTln27r0RC4YcOmerzIni3gUpsyqxfgMWk');
const royalty = Address.parse('EQAjv0nd5msonfRu32lo9cvHD1f4ESKlpg3aKzi54ogO-yZA');
const seller = Address.parse('EQDOv5rkDxpCG5BFgWfyfY90GIhluuubzEYR1btPRfPqDU88');
const buyer = Address.parse('EQAiVrwZ3vduIbVjncjmCzeG6tZmTGwLU8VddbUSwNQtNgRd');
const buyer2 = Address.parse('EQBSbI7sgBoO2yQYbP2hB_GBXhPpcEmLz5Nh10vcjv3QctGx');

declare type WantSendAction = {
    to: Address;
    mode: number;
    body :Cell;
    amount?: number;
};

async function main() {
    for (const hasRoyalty of [true, false]) {
        for (const flow of ["finish_by_time", "finish_by_seller", "finish_max_bid", "cancel_seller", "cancel_marketplace"]) {
            let flow_params = flow+" + royalty "+hasRoyalty;

            let contract = await SmartContract.fromFuncSource(source, getData(hasRoyalty, flow, fee, royalty, nft, marketplace), {
                debug: true,
            });
            contract.setC7Config({
                balance: toNano("0.05"),
                unixtime: 100,
            });

            let ownerAssigned = new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(seller).endCell();
            let res = await send(contract, seller, "0.01", ownerAssigned);
            must(flow_params, "msg exit_code on nft sent from unexpected", res.exit_code, 401);

            let body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("2")).endCell();
            res = await send(contract, buyer, "8", body);
            must(flow_params, "bid before start", res.exit_code, 403);

            res = await send(contract, nft, "0.01", ownerAssigned);
            must(flow_params, "msg exit_code on nft sent", res.exit_code, 0);

            res = await contract.invokeGetMethod("get_info", []);
            must(flow_params, "get_info exit_code after nft sent", res.exit_code, 0);
            let sellerSlice = (res.result[4] as Cell).beginParse();
            must(flow_params, "state after nft sent", res.result[0], 1);
            must(flow_params, "nft addr after nft sent", (sellerSlice.readAddress() as Address).toString(), nft.toString());
            must(flow_params, "seller after nft sent", (sellerSlice.readAddress() as Address).toString(), seller.toString());

            res = await contract.invokeGetMethod("get_last_bid", []);
            must(flow_params, "get_last_bid exit_code after nft sent", res.exit_code, 0);
            must(flow_params, "state after nft sent", res.result[0], 1);
            must(flow_params, "bid after nft sent", res.result[1].toString(), toNano("0.01").toString());
            must(flow_params, "bidder after nft sent", (res.result[2] as Slice).readAddress(), null);

            body = new Builder().storeUint(5, 32).storeUint(777, 64).endCell();
            res = await send(contract, marketplace, "1", body);
            must(flow_params, "maintain not allowed while active", res.exit_code, 403);

            body = new Builder().storeUint(4, 32).storeUint(777, 64).endCell();
            res = await send(contract, seller, "2", body);
            must(flow_params, "finish no bets", res.exit_code, 403);

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("0.0099")).endCell();
            res = await send(contract, buyer, "2", body);
            must(flow_params, "too small bid", res.exit_code, 410);

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("5")).endCell();
            res = await send(contract, buyer, "2", body);
            must(flow_params, "bigger than send bid", res.exit_code, 412);

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("2")).endCell();
            res = await send(contract, buyer, "2", body);
            must(flow_params, "eq with send bid", res.exit_code, 412);

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("1")).endCell();
            res = await send(contract, buyer, "2", body);
            must(flow_params, "min bid + commission reserve", res.exit_code, 0);
            checkActions(flow_params, "min bid + commission reserve", res.actionList, toNano("1.05"), [{
                to: buyer,
                mode: 128,
                body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
            }]);

            res = await contract.invokeGetMethod("get_last_bid", []);
            must(flow_params, "get_last_bid exit_code after bid", res.exit_code, 0);
            must(flow_params, "state after bid", res.result[0], 1);
            must(flow_params, "last bid after bid", res.result[1].toString(), toNano("1").toString());
            must(flow_params, "bidder after bid", ((res.result[2] as Slice).readAddress() as Address).toString(), buyer.toString());

            res = await contract.invokeGetMethod("get_info", []);
            must(flow_params, "get_info exit_code after after bid", res.exit_code, 0);
            if (flow == "finish_by_time") {
                must(flow_params, "finish time after bid", res.result[1], 10000);
            } else {
                must(flow_params, "finish time after bid", res.result[1], 0);
            }

            contract.setC7Config({
                balance: toNano("1.05"),
                unixtime: 9500,
            });

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("1")).endCell();
            res = await send(contract, buyer2, "2", body);
            must(flow_params, "new bid, equals previous", res.exit_code, 410);

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("1.004")).endCell();
            res = await send(contract, buyer2, "2", body);
            must(flow_params, "new bid, less than min up", res.exit_code, 412);

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("1.005")).endCell();
            res = await send(contract, buyer2, "3", body);
            must(flow_params, "new bid, min up", res.exit_code, 0);
            checkActions(flow_params, "new bid, min up", res.actionList, toNano("1.055"), [{
                to: buyer,
                mode: 1,
                body: new Builder().storeUint(0xb1d4c066, 32).storeUint(777, 64).endCell(),
                amount: toNano("1")
            }, {
                to: buyer2,
                mode: 128,
                body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
            }]);

            res = await contract.invokeGetMethod("get_last_bid", []);
            must(flow_params, "get_last_bid exit_code after new bid", res.exit_code, 0);
            must(flow_params, "state after new bid", res.result[0], 1);
            must(flow_params, "last bid after new bid", res.result[1].toString(), toNano("1.005").toString());
            must(flow_params, "bidder after new bid", ((res.result[2] as Slice).readAddress() as Address).toString(), buyer2.toString());

            res = await contract.invokeGetMethod("get_info", []);
            must(flow_params, "get_info exit_code after after new bid", res.exit_code, 0);
            if (flow == "finish_by_time") {
                must(flow_params, "finish time after new bid", res.result[1], 10000);
            } else {
                must(flow_params, "finish time after new bid", res.result[1], 0);
            }

            contract.setC7Config({
                balance: toNano("1.055"),
                unixtime: 9800,
            });

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("4.99")).endCell();
            res = await send(contract, buyer, "6", body);
            must(flow_params, "rebid from first buyer", res.exit_code, 0);
            checkActions(flow_params, "rebid from first buyer", res.actionList, toNano("5.04"), [{
                to: buyer2,
                mode: 1,
                body: new Builder().storeUint(0xb1d4c066, 32).storeUint(777, 64).endCell(),
                amount: toNano("1.005")
            }, {
                to: buyer,
                mode: 128,
                body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
            }]);

            res = await contract.invokeGetMethod("get_last_bid", []);
            must(flow_params, "get_last_bid exit_code after new bid", res.exit_code, 0);
            must(flow_params, "state after rebid", res.result[0], 1);
            must(flow_params, "last bid after rebid", res.result[1].toString(), toNano("4.99").toString());
            must(flow_params, "bidder after rebid", ((res.result[2] as Slice).readAddress() as Address).toString(), buyer.toString());

            res = await contract.invokeGetMethod("get_info", []);
            must(flow_params, "get_info exit_code after rebid", res.exit_code, 0);
            if (flow == "finish_by_time") {
                must(flow_params, "finish time after rebid", res.result[1], 10400);
            } else {
                must(flow_params, "finish time after rebid", res.result[1], 0);
            }

            contract.setC7Config({
                balance: toNano("5.04"),
                unixtime: 10400,
            });

            if (flow.includes("finish")) {
                if (flow != "finish_by_time") {
                    body = new Builder().storeUint(4, 32).storeUint(777, 64).endCell();
                    res = await send(contract, buyer, "2", body);
                    must(flow_params, "finish no access", res.exit_code, 403);
                }

                if (flow == "finish_max_bid") {
                    body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("5")).endCell();
                    res = await send(contract, buyer2, "6", body);
                    must(flow_params, "max bid from second buyer", res.exit_code, 0);
                    if (hasRoyalty) {
                        checkActions(flow_params, "max bid from second buyer", res.actionList, toNano("0.05"), [{
                            to: nft,
                            mode: 1,
                            body: new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(buyer2).storeAddress(buyer2).storeUint(0, 1).storeCoins(0).storeUint(0, 1).endCell(),
                            amount: toNano("0")
                        }, {
                            to: seller,
                            mode: 1,
                            body: new Builder().storeUint(0xf276d6ce, 32).storeUint(777, 64).endCell(),
                            amount: (toNano("5") - (toNano("0.05") * 5)) - (toNano("0.0475") * 2) // amount - fee - royalty
                        }, {
                            to: fee,
                            mode: 1,
                            body: new Builder().storeUint(0xff0b7094, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.05") * 5
                        }, {
                            to: royalty,
                            mode: 1,
                            body: new Builder().storeUint(0xde5d3c62, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.0475") * 2
                        }, {
                            to: buyer,
                            mode: 1,
                            body: new Builder().storeUint(0xb1d4c066, 32).storeUint(777, 64).endCell(),
                            amount: toNano("4.99")
                        }, {
                            to: buyer2,
                            mode: 128,
                            body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
                        }]);
                    } else {
                        checkActions(flow_params, "max bid from second buyer no royalty", res.actionList, toNano("0.05"), [{
                            to: nft,
                            mode: 1,
                            body: new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(buyer2).storeAddress(buyer2).storeUint(0, 1).storeCoins(0).storeUint(0, 1).endCell(),
                            amount: toNano("0")
                        }, {
                            to: seller,
                            mode: 1,
                            body: new Builder().storeUint(0xf276d6ce, 32).storeUint(777, 64).endCell(),
                            amount: (toNano("5") - (toNano("0.05") * 5)) // amount - fee
                        }, {
                            to: fee,
                            mode: 1,
                            body: new Builder().storeUint(0xff0b7094, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.05") * 5
                        }, {
                            to: buyer,
                            mode: 1,
                            body: new Builder().storeUint(0xb1d4c066, 32).storeUint(777, 64).endCell(),
                            amount: toNano("4.99")
                        }, {
                            to: buyer2,
                            mode: 128,
                            body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
                        }]);
                    }
                    contract.setC7Config({
                        balance: toNano("0.05"),
                        unixtime: 100,
                    });
                } else if (flow == "finish_by_seller") {
                    body = new Builder().storeUint(4, 32).storeUint(777, 64).storeCoins(toNano("5")).endCell();
                    res = await send(contract, seller, "2", body);
                    must(flow_params, "seller finish after some bids", res.exit_code, 0);
                    if (hasRoyalty) {
                        checkActions(flow_params, "seller finish after some bids", res.actionList, toNano("0.05"), [{
                            to: nft,
                            mode: 1,
                            body: new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(buyer).storeAddress(buyer).storeUint(0, 1).storeCoins(0).storeUint(0, 1).endCell(),
                            amount: toNano("0")
                        }, {
                            to: seller,
                            mode: 1,
                            body: new Builder().storeUint(0xf276d6ce, 32).storeUint(777, 64).endCell(),
                            amount: (toNano("4.99") - (toNano("0.0499") * 5)) - (toNano("0.047405") * 2) // amount - fee - royalty
                        }, {
                            to: fee,
                            mode: 1,
                            body: new Builder().storeUint(0xff0b7094, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.0499") * 5
                        }, {
                            to: royalty,
                            mode: 1,
                            body: new Builder().storeUint(0xde5d3c62, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.047405") * 2
                        }, {
                            to: seller,
                            mode: 128,
                            body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
                        }]);
                    } else {
                        checkActions(flow_params, "seller finish after some bids no royalty", res.actionList, toNano("0.05"), [{
                            to: nft,
                            mode: 1,
                            body: new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(buyer).storeAddress(buyer).storeUint(0, 1).storeCoins(0).storeUint(0, 1).endCell(),
                            amount: toNano("0")
                        }, {
                            to: seller,
                            mode: 1,
                            body: new Builder().storeUint(0xf276d6ce, 32).storeUint(777, 64).endCell(),
                            amount: (toNano("4.99") - (toNano("0.0499") * 5)) // amount - fee
                        }, {
                            to: fee,
                            mode: 1,
                            body: new Builder().storeUint(0xff0b7094, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.0499") * 5
                        }, {
                            to: seller,
                            mode: 128,
                            body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
                        }]);
                    }
                    contract.setC7Config({
                        balance: toNano("0.05"),
                        unixtime: 100,
                    });
                } else if (flow == "finish_by_time") {
                    body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("5")).endCell();
                    res = await send(contract, buyer2, "10", body);
                    must(flow_params, "bid after time finish", res.exit_code, 403);

                    res = await contract.invokeGetMethod("get_info", []);
                    must(flow_params, "get_info exit_code after time exceeded", res.exit_code, 0);
                    sellerSlice = (res.result[4] as Cell).beginParse();
                    must(flow_params, "state after time exceeded", res.result[0], 4);

                    res = await contract.invokeGetMethod("get_last_bid", []);
                    must(flow_params, "get_last_bid exit_code after time exceeded", res.exit_code, 0);
                    must(flow_params, "state after time exceeded", res.result[0], 4);
                    must(flow_params, "bidder after time exceeded", ((res.result[2] as Slice).readAddress() as Address).toString(), buyer.toString());
                    must(flow_params, "last bid after time exceeded", res.result[1].toString(), toNano("4.99").toString());

                    body = new Builder().storeUint(4, 32).storeUint(777, 64).endCell();
                    res = await send(contract, buyer2, "2", body);
                    must(flow_params, "finish", res.exit_code, 0);
                    if (hasRoyalty) {
                        checkActions(flow_params, "anyone finish after timeout", res.actionList, toNano("0.05"), [{
                            to: nft,
                            mode: 1,
                            body: new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(buyer).storeAddress(buyer).storeUint(0, 1).storeCoins(0).storeUint(0, 1).endCell(),
                            amount: toNano("0")
                        }, {
                            to: seller,
                            mode: 1,
                            body: new Builder().storeUint(0xf276d6ce, 32).storeUint(777, 64).endCell(),
                            amount: (toNano("4.99") - (toNano("0.0499") * 5)) - (toNano("0.047405") * 2) // amount - fee - royalty
                        }, {
                            to: fee,
                            mode: 1,
                            body: new Builder().storeUint(0xff0b7094, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.0499") * 5
                        }, {
                            to: royalty,
                            mode: 1,
                            body: new Builder().storeUint(0xde5d3c62, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.047405") * 2
                        }, {
                            to: buyer2,
                            mode: 128,
                            body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
                        }]);
                    } else {
                        checkActions(flow_params, "anyone finish after timeout no royalty", res.actionList, toNano("0.05"), [{
                            to: nft,
                            mode: 1,
                            body: new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(buyer).storeAddress(buyer).storeUint(0, 1).storeCoins(0).storeUint(0, 1).endCell(),
                            amount: toNano("0")
                        }, {
                            to: seller,
                            mode: 1,
                            body: new Builder().storeUint(0xf276d6ce, 32).storeUint(777, 64).endCell(),
                            amount: (toNano("4.99") - (toNano("0.0499") * 5)) // amount - fee
                        }, {
                            to: fee,
                            mode: 1,
                            body: new Builder().storeUint(0xff0b7094, 32).storeUint(777, 64).endCell(),
                            amount: toNano("0.0499") * 5
                        }, {
                            to: buyer2,
                            mode: 128,
                            body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
                        }]);
                    }
                    contract.setC7Config({
                        balance: toNano("0.05"),
                        unixtime: 100,
                    });
                }

                res = await contract.invokeGetMethod("get_info", []);
                must(flow_params, "get_info exit_code after finish", res.exit_code, 0);
                sellerSlice = (res.result[4] as Cell).beginParse();
                must(flow_params, "state after finish", res.result[0], 3);
                must(flow_params, "nft addr after finish", (sellerSlice.readAddress() as Address).toString(), nft.toString());
                must(flow_params, "seller after finish", (sellerSlice.readAddress() as Address).toString(), seller.toString());

                res = await contract.invokeGetMethod("get_last_bid", []);
                must(flow_params, "get_last_bid exit_code after finish", res.exit_code, 0);
                must(flow_params, "state after finish", res.result[0], 3);
                if (flow == "finish_max_bid") {
                    must(flow_params, "bidder after finish", ((res.result[2] as Slice).readAddress() as Address).toString(), buyer2.toString());
                    must(flow_params, "last bid after finish", res.result[1].toString(), toNano("5").toString());
                } else {
                    must(flow_params, "bidder after finish", ((res.result[2] as Slice).readAddress() as Address).toString(), buyer.toString());
                    must(flow_params, "last bid after finish", res.result[1].toString(), toNano("4.99").toString());
                }
            } else if (flow.includes("cancel")) {
                body = new Builder().storeUint(3, 32).storeUint(777, 64).endCell();
                res = await send(contract, buyer, "2", body);
                must(flow_params, "cancel no access", res.exit_code, 401);

                if (flow == "cancel_seller") {
                    body = new Builder().storeUint(3, 32).storeUint(777, 64).endCell();
                    res = await send(contract, seller, "1.4199", body);
                    must(flow_params, "cancel seller no fee + gas reserve", res.exit_code, 411);

                    body = new Builder().storeUint(3, 32).storeUint(777, 64).endCell();
                    res = await send(contract, seller, "1.42", body);
                    must(flow_params, "cancel seller with fee", res.exit_code, 0);
                    checkActions(flow_params, "cancel seller with fee", res.actionList, toNano("0.05"), [{
                        to: nft,
                        mode: 1,
                        body: new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(seller).storeAddress(seller).storeUint(0, 1).storeCoins(0).storeUint(0, 1).endCell(),
                        amount: toNano("0")
                    }, {
                        to: fee,
                        mode: 1,
                        body: new Builder().storeUint(0xff0b7094, 32).storeUint(777, 64).endCell(),
                        amount: toNano("0.42")
                    }, {
                        to: buyer,
                        mode: 1,
                        body: new Builder().storeUint(0xd3ba3292, 32).storeUint(777, 64).endCell(),
                        amount: toNano("4.99")
                    }, {
                        to: seller,
                        mode: 128,
                        body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
                    }]);
                    contract.setC7Config({
                        balance: toNano("0.05"),
                        unixtime: 100,
                    });
                } else if (flow == "cancel_marketplace") {
                    body = new Builder().storeUint(3, 32).storeUint(777, 64).endCell();
                    res = await send(contract, marketplace, "0.99", body);
                    must(flow_params, "cancel marketplace no gas reserve", res.exit_code, 412);

                    body = new Builder().storeUint(3, 32).storeUint(777, 64).endCell();
                    res = await send(contract, marketplace, "1", body);
                    must(flow_params, "cancel marketplace", res.exit_code, 0);
                    checkActions(flow_params, "cancel marketplace", res.actionList, toNano("0.05"), [{
                        to: nft,
                        mode: 1,
                        body: new Builder().storeUint(0x5fcc3d14, 32).storeUint(777, 64).storeAddress(seller).storeAddress(seller).storeUint(0, 1).storeCoins(0).storeUint(0, 1).endCell(),
                        amount: toNano("0")
                    }, {
                        to: buyer,
                        mode: 1,
                        body: new Builder().storeUint(0xd3ba3292, 32).storeUint(777, 64).endCell(),
                        amount: toNano("4.99")
                    }, {
                        to: marketplace,
                        mode: 128,
                        body: new Builder().storeUint(0x97f76206, 32).storeUint(777, 64).endCell(),
                    }]);
                    contract.setC7Config({
                        balance: toNano("0.05"),
                        unixtime: 100,
                    });
                }

                res = await contract.invokeGetMethod("get_last_bid", []);
                must(flow_params, "get_last_bid exit_code after cancel", res.exit_code, 403);

                res = await contract.invokeGetMethod("get_info", []);
                must(flow_params, "get_info exit_code after cancel", res.exit_code, 0);
                sellerSlice = (res.result[4] as Cell).beginParse();
                must(flow_params, "state after cancel", res.result[0], 2);
                must(flow_params, "nft addr after cancel", (sellerSlice.readAddress() as Address).toString(), nft.toString());
                must(flow_params, "seller after cancel", (sellerSlice.readAddress() as Address).toString(), seller.toString());
            }

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("5")).endCell();
            res = await send(contract, buyer, "8", body);
            must(flow_params, "bid after end", res.exit_code, 403);

            body = new Builder().storeUint(3, 32).storeUint(777, 64).endCell();
            res = await send(contract, seller, "8", body);
            must(flow_params, "cancel after end", res.exit_code, 403);

            body = new Builder().storeUint(1, 32).storeUint(777, 64).endCell();
            res = await send(contract, marketplace, "1", body);
            must(flow_params, "topup", res.exit_code, 0);

            body = new Builder().storeUint(777, 32).storeUint(777, 64).endCell();
            res = await send(contract, marketplace, "1", body);
            must(flow_params, "unknown msg", res.exit_code, 0xFFFF);

            body = new Builder().endCell();
            res = await send(contract, marketplace, "1", body, true);
            must(flow_params, "empty msg", res.type, "failed");

            body = new Builder().storeUint(2, 32).storeUint(777, 64).storeCoins(toNano("5")).endCell();
            res = await send(contract, buyer, "8", body, false, true);
            must(flow_params, "bounced", res.exit_code, 0);

            body = new Builder().storeUint(5, 32).storeUint(777, 64).endCell();
            res = await send(contract, seller, "1", body);
            must(flow_params, "maintain no access", res.exit_code, 401);

            body = new Builder().storeUint(5, 32).storeUint(777, 64).storeUint(1, 8).storeRef(new Builder()
                .storeUint(0x18, 6)
                .storeAddress(fee)
                .storeCoins(toNano("0.03"))
                .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
                .endCell()).endCell();
            res = await send(contract, marketplace, "1", body);
            must(flow_params, "maintain", res.exit_code, 0);
            checkActions(flow_params, "maintain marketplace", res.actionList, 0, [{
                to: fee,
                mode: 1,
                body: new Builder().endCell(),
                amount: toNano("0.03")
            }]);
            contract.setC7Config({
                balance: toNano("0.02"),
                unixtime: 100,
            });
        }
    }

    console.log("all cases passed!");
}

async function send(contract :SmartContract, from :Address, amount :string, body :Cell, shouldFail? :boolean, bounced? :boolean) {
    let res = await contract.sendInternalMessage(new InternalMessage({
        to: me,
        from: from,
        value: toNano(amount),
        bounced: bounced,
        bounce: false,
        body: new CommonMessageInfo({
            body: new CellMessage(body)
        })
    }));

    let fail = false;
    if (res.type == "failed" && res.exit_code < 50) { // catch TVM failed cases
        if (shouldFail) {
            if (res.type != "failed") {
                throw "execution should fail but its not"
            }
            return res;
        }

        res.logs.split("\n").forEach(function (str) {
            console.log(str);
        });
        // bypass compiler conversion to successful result, because type not exported
        fail = true;
    }

    if (fail) {
        throw "TVM failed on processing internal message"
    }

    res.logs.split("\n").forEach(function (str) {
        if (str.includes("#DEBUG#:")) {
            console.log(str);
        }
    });

    return res;
}

function must(flow :string, what :string, val: any, want: any) {
    if (val != want) {
        throw "["+flow+"] "+what+": condition failed, want '"+want+"', but its '"+val+"'";
    }
    console.log("["+flow+"] "+what+": ok");
}

function checkActions(flow :string, what :string, actions :OutAction[], wantReserve :number, wantSends :WantSendAction[]) {
    let reserved = 0;
    let sendNum = 0;
    let other = 0;

    actions.forEach(function (val) {
        switch (val.type) {
            case "reserve_currency":
                reserved = val.currency.coins.toNumber();
                break;
            case "send_msg":
                sendNum++;

                let amount :number = 0;

                if (val.message.info.type === "internal") {
                    amount = val.message.info.value.coins.toNumber();
                }

                let ok = false;
                wantSends.forEach(function (act) {
                    if ((val.message.info.dest as Address).toString() == act.to.toString() &&
                        val.mode == act.mode &&
                        val.message.body.hash().toString() == act.body.hash().toString()) {
                        if(act.amount == undefined || act.amount == amount) {
                            ok = true;
                        }
                    }
                });

                if (!ok) {
                    throw "["+flow+"] "+what+": actions check failed, unexpected send of mode "+val.mode+", amount "+amount.toString()+" body "+val.message.body.toDebugString("   ")+" to addr "+(val.message.info.dest as Address).toFriendly({
                        bounceable: true,
                    });
                }

                break;
            default:
                other++;
        }
    });

    if (other != 0) {
        throw "["+flow+"] "+what+": actions check failed, have "+other+" unknown actions";
    }

    if (reserved != wantReserve) {
        throw "["+flow+"] "+what+": actions check failed, have "+reserved+" reserved amount but should be "+wantReserve;
    }

    if (wantSends.length != sendNum) {
        throw "["+flow+"] "+what+": actions check failed, have "+sendNum+" sends but should be "+wantSends.length;
    }

    console.log("["+flow+"] "+what+" actions check: ok");
}

function getData(hasRoyalty :boolean, flow :string, fee: Address, royalty: Address, nft: Address, marketplace: Address) {
        let feeParams = new Builder().
            storeUint(5, 16).   // numerator
            storeUint(100, 16). // denominator
            storeAddress(fee).endCell();

        let royaltyParams :Cell | null;

        if (hasRoyalty) {
            royaltyParams = new Builder().
                storeUint(20, 16).   // numerator
                storeUint(1000, 16). // denominator
                storeAddress(royalty).endCell();
        } else {
            royaltyParams = null;
        }

        let end = 0;
        let max = 0;
        if (flow == "finish_by_time") {
            end = 10000;
        } else if (flow == "finish_max_bid") {
            max = toNano("5");
        }

        return new Builder().
        storeUint(0, 2).                                              // state uninit
            storeUint(end, 32).                                             // end time
            storeCoins(toNano("0.01")). // min bid
            storeCoins(toNano("0.005")). // min up bid
            storeCoins(max).  // max bid
            storeUint(0, 2).                                          // last bidder
            storeRef(
                new Builder().
                storeAddress(nft).
                endCell(),
            ). // seller cell
            storeRef(
                new Builder().
                storeAddress(marketplace).
                storeRef(feeParams).
                storeRefMaybe(royaltyParams).
                endCell(),
            ).                                                // marketplace cell
            endCell();
}

let source = `
builder store_coins(builder b, int x) asm "STVARUINT16";
(slice, int) load_coins(slice s) asm( -> 1 0) "LDVARUINT16";

int op::nft_ownership_assigned() asm "0x5fcc3d14 PUSHINT";
int op::nft_transfer() asm "0x5fcc3d14 PUSHINT";

int local_op::topup() asm "1 PUSHINT";
int local_op::bid() asm "2 PUSHINT";
int local_op::cancel() asm "3 PUSHINT";
int local_op::finish() asm "4 PUSHINT";
int local_op::maintain() asm "5 PUSHINT";

int state::uninit() asm "0 PUSHINT";
int state::active() asm "1 PUSHINT";
int state::canceled() asm "2 PUSHINT";
int state::finished() asm "3 PUSHINT";
;; special state just for GET methods
int state::time_exceeded() asm "4 PUSHINT";

int error::unauthorized() asm "401 PUSHINT";
int error::wrong_state() asm "403 PUSHINT";
int error::too_small_bid() asm "410 PUSHINT";
int error::not_includes_fine() asm "411 PUSHINT";
int error::not_enough_gas_reserve() asm "412 PUSHINT";

int auction::finished() asm "0xf276d6ce PUSHINT";
int auction::canceled() asm "0xd3ba3292 PUSHINT";
int auction::bid_return() asm "0xb1d4c066 PUSHINT";
int auction::unused_return() asm "0x97f76206 PUSHINT";
int auction::nft_royalty() asm "0xde5d3c62 PUSHINT";
int auction::marketplace_fee() asm "0xff0b7094 PUSHINT";

int min_gas_amount() asm "1000000000 PUSHINT"; ;; 1 TON
int cancel_fine_amount() asm "420000000 PUSHINT"; ;; 0.42 TON

int equal_slices(slice a, slice b) asm "SDEQ";

() save_data(int state, int end_time, int last_bid, int min_up_bid, int max_bid, slice last_bidder, cell seller, cell marketplace) impure inline {
  set_data(begin_cell()
    .store_uint(state, 2)
    .store_uint(end_time, 32)
    .store_coins(last_bid)
    .store_coins(min_up_bid)
    .store_coins(max_bid)
    .store_slice(last_bidder)
    .store_ref(seller)
    .store_ref(marketplace)
  .end_cell());
}

(int, int, int, int, int, slice, cell, cell) load_data(slice data) inline {
  int state = data~load_uint(2);
  int end_time = data~load_uint(32);
  int last_bid = data~load_coins();
  int min_up_bid = data~load_coins();
  int max_bid = data~load_coins();
  slice bidder_addr = data~load_msg_addr();
  cell seller = data~load_ref();
  cell marketplace = data~load_ref();

  return (state, end_time, last_bid, min_up_bid, max_bid, bidder_addr, seller, marketplace);
}

int is_time_exceeded(int end_time) inline {
  return (end_time > 0) & (end_time <= now());
}

() check_active(int state, int end_time) impure inline {
  throw_if(error::wrong_state(), (state != state::active()) | is_time_exceeded(end_time));
}

;; initial amount for keeping contract alive, we keep it equal to value at deploy moment,
;; can be topuped in any moment by simple transfer from anyone
int keepalive_balance(int balance, int msg_value, slice last_bidder, int last_bid) inline {
  int keep_balance = balance - msg_value;

  ;; if we have any previous bid, we will send it to bidder or seller in any case
  if (last_bidder.slice_bits() > 2) {
    keep_balance = keep_balance - last_bid;
  }

  return keep_balance;
}

(int, slice) calc_fee(cell params, int amount) inline {
  slice fee_params = params.begin_parse();
  int fee_numerator = fee_params~load_uint(16);
  int fee_denominator = fee_params~load_uint(16);
  slice fee_addr = fee_params~load_msg_addr();

  int fee = (amount / fee_denominator) * fee_numerator;
  return (fee, fee_addr);
}

() send_nft(int query_id, slice nft_addr, slice to) impure inline {
    var msg = begin_cell()
           .store_uint(0x18, 6)
           .store_slice(nft_addr)
           .store_coins(0)
           .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
           .store_uint(op::nft_transfer(), 32)
           .store_uint(query_id, 64)
           .store_slice(to)  ;; new_owner_address
           .store_slice(to)  ;; response_address
           .store_int(0, 1)  ;; empty custom_payload
           .store_coins(0)   ;; forward amount to new_owner_address
           .store_int(0, 1); ;; empty forward_payload

     send_raw_message(msg.end_cell(), 1);
}

() send(int mode, int query_id, int amount, slice to, int reason_code) impure {
    var msg = begin_cell()
           .store_uint(0x18, 6)
           .store_slice(to)
           .store_coins(amount)
           .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
           .store_uint(reason_code, 32)
           .store_uint(query_id, 64);

     send_raw_message(msg.end_cell(), mode);
}

() finish(int query_id, int end_time, int last_bid, int min_up_bid, int max_bid, slice winner_addr, slice nft_addr, slice seller_addr, cell seller, cell marketplace) impure {
  slice marketplace_slice = marketplace.begin_parse();
  (int m_fee, slice m_fee_addr) = calc_fee(marketplace_slice~load_ref(), last_bid);
  send(1, query_id, m_fee, m_fee_addr, auction::marketplace_fee());
  int amount = last_bid - m_fee;

  marketplace_slice~load_msg_addr();
  cell nft_royalty_fee_params = marketplace_slice~load_dict();
  if (~ cell_null?(nft_royalty_fee_params)) {
    (int r_fee, slice r_fee_addr) = calc_fee(nft_royalty_fee_params, amount);
    send(1, query_id, r_fee, r_fee_addr, auction::nft_royalty());
    amount = amount - r_fee;
  }

  send(1, query_id, amount, seller_addr, auction::finished());
  send_nft(query_id, nft_addr, winner_addr);

  save_data(state::finished(), end_time, last_bid, min_up_bid, max_bid, winner_addr, seller, marketplace);
}

() process_bid(int balance, int query_id, slice data, slice cs, slice in_msg, int msg_value) impure inline {
  (int state, int end_time, int last_bid,
    int min_up_bid, int max_bid, slice last_bidder, cell seller, cell marketplace) = load_data(data);

  check_active(state, end_time);

  ;; load amount which user wants to bid from message, the rest will be used for gas, we will return unused
  int amount = in_msg~load_coins();
  throw_if(error::not_enough_gas_reserve(), msg_value - min_gas_amount() < amount);

  var is_max_bid = (max_bid > 0) & (amount >= max_bid);

  if (last_bidder.slice_bits() == 2) {
    ;; addr_none = no bids yet, last_bid = min bid
    throw_if(error::too_small_bid(), last_bid > amount);
  } else {
    ;; allow if its more than min up or if its >= max_bid
    throw_if(error::too_small_bid(), (last_bid + min_up_bid > amount) & (~ is_max_bid));

    send(1, query_id, last_bid, last_bidder, auction::bid_return());
  }

  slice bidder_addr = cs~load_msg_addr();
  int keepalive = keepalive_balance(balance, msg_value, last_bidder, last_bid);

  if (is_max_bid) {
    ;; reserve keepalive balance
    raw_reserve(keepalive, 0);

    slice seller_slice = seller.begin_parse();
    slice nft_addr = seller_slice~load_msg_addr();
    slice seller_addr = seller_slice~load_msg_addr();

    finish(query_id, end_time, amount, min_up_bid, max_bid, bidder_addr, nft_addr, seller_addr, seller, marketplace);
  } else {
    ;; if its less than 5 min till end, prolongate auction for 10 min (anti-sniper)
    if ((end_time > 0) & ((end_time - 300) < now())) {
      end_time = now() + 600;
    }

    ;; reserve bid + keepalive balance
    raw_reserve(amount + keepalive, 0);
    save_data(state, end_time, amount, min_up_bid, max_bid, bidder_addr, seller, marketplace);
  }

  ;; send back whats left and not reserved, its unused amount from transaction
  return send(128, query_id, 0, bidder_addr, auction::unused_return());
}

() process_cancel(int balance, int query_id, slice data, slice cs, int msg_value) impure inline {
  (int state, int end_time, int last_bid,
    int min_up_bid, int max_bid, slice last_bidder, cell seller, cell marketplace) = load_data(data);

  check_active(state, end_time);

  slice s_slice = seller.begin_parse();
  slice nft_addr = s_slice~load_msg_addr();
  slice seller_addr = s_slice~load_msg_addr();

  slice m_slice = marketplace.begin_parse();
  slice marketplace_addr = m_slice~load_msg_addr();

  slice req_addr = cs~load_msg_addr();

  var is_seller = equal_slices(seller_addr, req_addr);
  ;; allow cancel only to seller and marketplace
  throw_unless(error::unauthorized(), is_seller | equal_slices(marketplace_addr, req_addr));

  send_nft(query_id, nft_addr, seller_addr);
  send(1, query_id, last_bid, last_bidder, auction::canceled());

  ;; only seller pays cancel fine
  if (is_seller) {
      throw_if(error::not_includes_fine(), msg_value < (cancel_fine_amount() + min_gas_amount()));

      slice marketplace_slice = marketplace.begin_parse();
      cell marketplace_fee = marketplace_slice~load_ref();
      slice marketplace_fee_slice = marketplace_fee.begin_parse();
      marketplace_fee_slice~skip_bits(32);

      send(1, query_id, cancel_fine_amount(), marketplace_fee_slice~load_msg_addr(), auction::marketplace_fee());
  } else {
      throw_if(error::not_enough_gas_reserve(), msg_value < min_gas_amount());
  }

  slice addr_none = begin_cell().store_uint(0, 2).end_cell().begin_parse();
  raw_reserve(keepalive_balance(balance, msg_value, last_bidder, last_bid), 0);

  save_data(state::canceled(), end_time, 0, min_up_bid, max_bid, addr_none, seller, marketplace);

  return send(128, query_id, 0, req_addr, auction::unused_return());
}

;; process finish, can be triggered by anyone to run process of completion when time is over, or by seller when at least 1 bid was done
() process_finish(int balance, int query_id, slice data, slice cs, int msg_value) impure inline {
  (int state, int end_time, int last_bid,
    int min_up_bid, int max_bid, slice last_bidder, cell seller, cell marketplace) = load_data(data);

  slice seller_slice = seller.begin_parse();
  slice nft_addr = seller_slice~load_msg_addr();
  slice seller_addr = seller_slice~load_msg_addr();

  slice req_addr = cs~load_msg_addr();

  var is_seller_and_bid_done = (last_bidder.slice_bits() > 2) & equal_slices(seller_addr, req_addr);

  ;; allow finish only when time is exceeded or to seller when at least 1 bid was done
  throw_unless(error::wrong_state(), (state == state::active()) & (is_time_exceeded(end_time) | is_seller_and_bid_done));

  finish(query_id, end_time, last_bid, min_up_bid, max_bid, last_bidder, nft_addr, seller_addr, seller, marketplace);

  raw_reserve(keepalive_balance(balance, msg_value, last_bidder, last_bid), 0);
  return send(128, query_id, 0, req_addr, auction::unused_return());
}

;; it can be used to resolve issues, for example move money from the contract, if its too much or someone did wrong transfer
;; can be used only after finish or before start, to guarantee that marketplace cant steel nft or money
() process_maintain(slice data, slice cs, slice in_msg) impure inline {
  (int state, int end_time, int last_bid,
    int min_up_bid, int max_bid, slice last_bidder, cell seller, cell marketplace) = load_data(data);

  slice m_slice = marketplace.begin_parse();
  slice marketplace_addr = m_slice~load_msg_addr();

  slice req_addr = cs~load_msg_addr();

  ;; allow only to marketplace
  throw_unless(error::unauthorized(), equal_slices(marketplace_addr, req_addr));

  ;; auction should be not active
  throw_if(error::wrong_state(), state == state::active());

  var mode = in_msg~load_uint(8);
  return send_raw_message(in_msg~load_ref(), mode);
}

;; testable
() recv_internal(int balance, int msg_value, cell in_msg_cell, slice in_msg) impure {
  slice cs = in_msg_cell.begin_parse();
  int flags = cs~load_uint(4);

  if (flags & 1) {
    ;; ignore bounced
    return ();
  }

  slice data = get_data().begin_parse();

  int op = in_msg~load_uint(32);
  int query_id = in_msg~load_uint(64);

  if (op == local_op::bid()) {
    return process_bid(balance, query_id, data, cs, in_msg, msg_value);
  }
  if (op == local_op::cancel()) {
    return process_cancel(balance, query_id, data, cs, msg_value);
  }
  if (op == local_op::finish()) {
    return process_finish(balance, query_id, data, cs, msg_value);
  }
  if (op == local_op::maintain()) {
    return process_maintain(data, cs, in_msg);
  }

  if (op == local_op::topup()) {
    ;; just accept money
    return ();
  }

  ;; activate auction when it gets desired nft
  if (op == op::nft_ownership_assigned()) {
    int state = data~load_uint(2);
    throw_unless(error::wrong_state(), state == state::uninit());

    slice seller_slice = data~load_ref().begin_parse();

    slice req_nft_addr = cs~load_msg_addr();
    slice nft_addr = seller_slice~load_msg_addr();

    throw_unless(error::unauthorized(), equal_slices(nft_addr, req_nft_addr));

    slice nft_seller_addr = in_msg~load_msg_addr();

    cell seller = begin_cell()
        .store_slice(nft_addr)
        .store_slice(nft_seller_addr)
      .end_cell();

    ;; store new state + what we had in data, add new seller ref
    return set_data(begin_cell()
      .store_uint(state::active(), 2)
      .store_slice(data.preload_bits(data.slice_bits()))
      .store_ref(seller)
      .store_ref(data.preload_ref())
    .end_cell());
  }

  throw(0xffff);
}

(int, int, int, int, cell, cell) get_info() method_id {
  (int state, int end_time, int last_bid,
    int min_up_bid, int max_bid, slice last_bidder, cell seller, cell marketplace) = load_data(get_data().begin_parse());

    throw_if(error::wrong_state(), state == state::uninit());

    if (is_time_exceeded(end_time)) {
      state = state::time_exceeded();
    }

    return (state, end_time, min_up_bid, max_bid, seller, marketplace);
}

(int, int, slice) get_last_bid() method_id {
    (int state, int end_time, int last_bid,
      int min_up_bid, int max_bid, slice last_bidder, cell seller, cell marketplace) = load_data(get_data().begin_parse());

    throw_if(error::wrong_state(), (state != state::active()) & (state != state::finished()));

    if (is_time_exceeded(end_time)) {
      state = state::time_exceeded();
    }

    return (state, last_bid, last_bidder);
}
`;

main();