const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({

    jobNumber:{
        type:String,
        required:true,
        unique:true
    },

    customerName:String,

    mobile:String,

    deviceType:String,

    brand:String,

    modelNumber:String,

    serialNumber:String,

    problem:String,

    status:{
        type:String,
        default:"Received"
    },

    payment:{
        type:String,
        default:""
    },

    repairEngineer:{
        type:String,
        default:"None"
    },
    
    remark:{
    type:String,
    default:""
    },
    
    engineerNotes:String,

    estimatedPrice:String,

    finalPrice:String,

    jobDate:{
        type:String
    },

    createdAt:{
        type:Date,
        default:Date.now
    },

    accessories:{
    type:String,
    default:""
    },
    
    failedAttempts:{
        type:Number,
        default:0
    },

    lockedUntil:{
        type:Date,
        default:null
    }

});

jobSchema.set("timestamps", true);

module.exports =
mongoose.model("Job", jobSchema);