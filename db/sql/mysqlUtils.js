/**
 * Created by ctalmacel on 12/21/15.
 */

var mysql = require('mysql');
var Q = require('q');
var modelUtil = require("../../lib/ModelDescription.js");

exports.createTable= function(persistenceStrategy,tableName,model){
    var query = 'CREATE TABLE IF NOT EXISTS '+tableName+'(';
    for(field in model){
        query+=field+' ';
        var type = model[field].type;
        var dbType = persistenceStrategy.getDatabaseType(type);
        if(dbType === 'varchar'){
            if(model[field]['length']){
                dbType += '('+model[field]['length']+') ';
            }else {
                dbType += '(30) ';
            }
        }

        if(dbType === 'int'){
            if(model[field]['length']){
                dbType += '('+model[field]['length']+') ';
            }else {
                dbType += '(10) ';
            }
        }
        query+=dbType;

        if(model[field].hasOwnProperty('default')){
            if(dbType.startsWith('varchar')) {
                query += " DEFAULT '" + model[field].default+"'";
            }else{
                query += " DEFAULT " + model[field].default;
            }
        }
        query+=',';
    }
    for(field in model) {
        if (model[field].pk === true) {
            query += ' PRIMARY KEY (' + field + '),';
        }
    }
    query = query.slice(0,-1);
    query+=');';

    return query;
};

exports.insertRow = function(tableName,serializedData){

    var model = modelUtil.getModel(tableName);

    var query="REPLACE INTO "+tableName+" (";
    for (field in serializedData){
        query += field + ",";
    }
    query = query.slice(0, -1);
    query += ") VALUES (";



    for(var field in serializedData){
        query+= mysql.escape(serializedData[field])+',';
    }
    query = query.slice(0, -1);
    query+=');';
    return query;
};

exports.insertDataIntoTable = function(mysqlConnection,persistence,tableName,serializedData){
    var result = [];
    var runQuery = Q.nbind(mysqlConnection.query,mysqlConnection);
    serializedData.forEach(function(row,index){
        result.push(runQuery(exports.insertRow(mysqlConnection,persistence,tableName,row)));
    });
    return Q.all(result);
};

exports.createAndPopulateNewTable = function(mysqlConnection,persistence,tableName,model,serializedData){
    return exports.createNewTable(mysqlConnection,persistence,tableName,model).
    then(function(){return exports.insertDataIntoTable(mysqlConnection,persistence,tableName,serializedData,model)}).
    catch(function(err){console.log(err.stack);});
};

exports.createNewTable = function(mysqlConnection,persistence,tableName,model){
    return exports.dropTable(mysqlConnection,tableName).
    then(function(){return exports.createTable(mysqlConnection,persistence,tableName,model)}).
    catch(function(err){console.log(err.stack);});
};

exports.dropTable =function(tableName){
    return "DROP TABLE IF EXISTS " +tableName+";";
};

exports.deleteObject = function(typeName,serialized_id){
    return "DELETE from "+typeName+ " WHERE "+modelUtil.getPKField(typeName)+" = "+mysql.escape(serialized_id)+";";
}

exports.describeTable = function(typeName){
    return "DESCRIBE "+typeName;
}

exports.find = function(typeName,pkField,serializedPk){
    var query = 'SELECT * from ' + typeName + ' WHERE ' + pkField + " = " + mysql.escape(serializedPk)+";";
    return query
}

exports.update = function(typeName,pkField,serialisedPk,fields,values){
    var model = modelUtil.getModel(typeName);

    var query = 'UPDATE '+typeName+ " SET ";
    var length = fields.length;
    fields.forEach(function(field,index) {
            query += field+"=" +mysql.escape(values[index])+",";
        
    });
    query = query.slice(0,-1);
    query+=" WHERE "+pkField+"="+mysql.escape(serialisedPk)+";";

    return query;
}

exports.filter = function(typeName,filter){

    function isComparison(filter) {
        return (["<", "!", ">"].indexOf(filter[0]) != -1);
    }

    var required_fields;
    if(filter['REQUIRED_FIELDS']){
        required_fields = filter['REQUIRED_FIELDS'].reduce(function(prev,current){
            if(prev.length>0){
                return prev+", "+current;
            }else{
                return current;
            }
        },"")
    }else {
        required_fields = "*"
    }

    var query = "SELECT "+required_fields+" from "+typeName+" ";
    var model = modelUtil.getModel(typeName);

    if(filter == undefined){
        return query+";";
    }
    query +="WHERE ";
    for(var field in filter){
        var type = model.getFieldType(field);
        if(type === null){
            continue;  //in filter we can have fields such as LIMIT
        }

        /*
            If filter[field] is an array then the elements of the array are disjunctive conditions (put an OR between them e.g. more than or less than)
            If a condition is an array then the elements are conjunctive conditions (put ANd between them e.g. more than and but less than)

            ['COND_A' or 'COND_B' or ['COND_C' AND 'COND_D']]
         */

        if(Array.isArray(filter[field])){
            //disjunctive conditions
            query+="( ";
            filter[field].forEach(function(condition){
                if(Array.isArray(condition)){
                    //conjunctive conditions
                    query+="( ";
                    condition.forEach(function(subCondition){
                        insertCondition(field,subCondition,"AND");
                    })
                    query = query.slice(0,-4); //cut the last 'AND'
                    query+=") OR ";
                }else {
                    insertCondition(field,condition,"OR");
                }
            });
            query = query.slice(0,-3); //cut the last 'OR'
            query+=") AND ";
        } else {
            insertCondition(field,filter[field],"AND");
        }
    }


    function insertCondition(field,condition,logicalOperator){
        if(isComparison(condition)) {
            var sign = condition.split(/[^<>=!]/)[0].replace(' ', '');
            var value = condition.replace(sign, '').replace(' ', '');
            query+=field+sign+mysql.escape(value)+" "+logicalOperator+" ";
        } else {
            query += field + "="+mysql.escape(condition)+" "+logicalOperator+" ";
        }
    }

    query = query.slice(0,-4); //cut the last 'AND'



    if(filter.hasOwnProperty("ORDER")) {
        query += " ORDER BY "
        if (Array.isArray(filter['ORDER'])) {
            filter['ORDER'].forEach(addOrderField);
        } else {
            addOrderField(filter["ORDER"]);
        }
        function addOrderField(orderField) {
            query += orderField.field + " ";
            if (orderField.type) {
                query += orderField.type;
            }
            query += ",";
        }
    }
    query = query.slice(0,-1); //cut the last ','

    if(filter.hasOwnProperty("LIMIT")){
        if(!filter['LIMIT'].lowerBound || !filter["LIMIT"].upperBound){
            throw new Error("'LIMIT' field of filters must have at least one of the following fields: 'lowerBound','upperBound' ")
        }
        query+=" LIMIT "+filter['LIMIT'].lowerBound+","+filter["LIMIT"].upperBound;
    }


    query+=";";

    return query;
}




