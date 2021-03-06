/**
 * Created by ctalmacel on 1/5/16.
 */




var apersistence = require("../lib/abstractPersistence.js");
var mysqlUtils = require("../db/sql/mysqlUtils");
var assert       = require('double-check').assert;
var exceptions   = require('double-check').exceptions;
var modelUtil  = require("../lib/ModelDescription");
var mysql      = require('mysql');
var mysqlPool = mysql.createPool({
    host     : 'localhost',
    user     : 'root',
    password : 'operando',
    database : 'operando'
});


var rawData = [
        {id: "2", name: "Dana", location: "Tecuci",sex:true,age:20},
        {id: "3", name: "Dan", location: "Iasi",sex:false,age:20},
        {id: "4", name: "Ana", location: "Bucuresti",sex:true,age:21},
        {id: "5", name: "Ion", location: "Iasi",sex:false,age:22}
];

var model = {
    id: {
        type:'int',
        pk:true
    },
    name: {
        type:'string',
        default:0,
        index:true,
        length:140
    },
    location: {
        type:'string',
        default:true
    },
    sex: {
        type:'boolean',
        default:true
    },
    age: {
        type:'int',
        default:19
    }
};

var persistence = apersistence.createMySqlPersistence(mysqlPool);
var modelName = "TestUser";
var objects;
var testModelValidation = require('./persistenceTests/testModelValidation').test;
var testFindById = require('./persistenceTests/testFindById').test;
var testFilter = require('./persistenceTests/testFilter').test;
var testDeleteById = require('./persistenceTests/testDeleteById').test;
var testSaveNewObject = require('./persistenceTests/testSaveNewObject').test;
var testUpdateObject = require('./persistenceTests/testUpdateObject').test;




assert.steps("Mysql test suite",[
    function(next){
        persistence.registerModel(modelName,model,function(err,result){
            if(err){
                console.log(err);
            }else{
                next();
            }
        })
    },
    function(next){
        var serializedData = rawData.map(function(row){
            var serial = {};
            for(var field in row)
                serial[field] = modelUtil.serialiseField(modelName,field,row[field],persistence.persistenceStrategy);
            return serial;
        })

        var done = serializedData.length;
        serializedData.forEach(function(serializedRow){
            mysqlPool.query(mysqlUtils.insertRow(modelName,serializedRow),function(err,result){
                if(err){
                    console.log(err);
                }else{
                    done--;
                    if(done===0){
                        next();
                    }
                }
            })
        })
    },
    function(next){

        var invalidIds = [7,10];
        var ids = rawData.map(function(object){
            return object.id;
        });

        testFindById(persistence,modelName,ids,invalidIds,function(testWasSuccessful){
            testWasSuccessful();
            next();
        });
    },
    function(next){
        var ids = rawData.map(function(tableEntry){
            return tableEntry.id;
        });

        testDeleteById(persistence,modelName,ids,function(testWasSuccessfull){
            testWasSuccessfull();
            next();
        })
    },
    function(next){
        objects = rawData.map(function(data){
            return modelUtil.createObjectFromData(modelName,data);
        });

        testSaveNewObject(persistence,objects,function(testWasSuccessful){
            testWasSuccessful();
            next();
        })
    },
    function(next){
        var filterTests = [
            {
                modelName:modelName,
                filter:{
                    location:['Iasi'],
                    sex:false,
                    LIMIT:{lowerBound:1,upperBound:2},
                    ORDER:[{field:"name",type:"ASC"}],
                    REQUIRED_FIELDS:["location","sex"]
                },
                expectedResults: [
                    {location:"Iasi",sex:false}
                ]
            },
            {
                modelName:modelName,
                filter:{age:[">20"], name:["!=Ana"]},
                expectedResults:[{id: 5, name: "Ion", location: "Iasi",sex:false,age:22}]
            },
            {
                modelName:modelName,
                filter:{
                    location:"Bucuresti",
                    name:"Ana"
                },
                expectedResults: [{id: 4, name: "Ana", location: "Bucuresti",sex:true,age:21}]
            },
            {
                modelName:modelName,
                filter:{
                    age:[[">=20","<21"],"22"],  // (>=20 AND <21) OR (=22)
                    REQUIRED_FIELDS:['name']
                },
                expectedResults: [{name: "Dana"},{name: "Dan"},{name: "Ion"}]
            }
        ];
        
        testFilter(persistence,filterTests,function(testWasSuccessfull){
            testWasSuccessfull();
            next();
        })
    },
    function(next){
        testUpdateObject(persistence,objects,function(testWasSuccessful){
            testWasSuccessful();
            next();
        })
    },
    function(next){
        mysqlPool.query(mysqlUtils.dropTable(modelName),function(err,result){
            if(err){
                console.log(err);
            }else{
                next();
            }
        });
    },
    function(next){
        mysqlPool.end();
        next();
    }
],1000);
