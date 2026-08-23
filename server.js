const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();
const Job = require("./models/Job");
const QRCode = require("qrcode");
const session = require("express-session");

const helmet = require("helmet");
const app = express();

console.log(Job.schema.paths);

// DATABASE CONNECT
console.log("MONGO_URI =", process.env.MONGO_URI);


mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});


// MIDDLEWARE
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    helmet({
        contentSecurityPolicy:false
    })
);

app.use(session({

    secret: process.env.SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    cookie:{
        httpOnly:true,

        secure: process.env.NODE_ENV === "production",

        sameSite:"lax",

        maxAge:1000 * 60 * 60 * 24 * 7
    }

}));

// STATIC FILES
app.use(express.static(path.join(__dirname, "public")));


// VIEW ENGINE
app.set("view engine", "ejs");

function checkAdmin(req, res, next){

    if(req.session.isAdmin){

        next();

    }else{

        res.redirect("/admin/login");

    }

}

function checkAdmin(req, res, next){

    if(req.session.isAdmin){

        next();

    }else{

        res.redirect("/admin/login");

    }

}


function checkEngineer(req, res, next){

    if(req.session.isEngineer){

        next();

    }else{

        res.redirect("/engineer/login");

    }

}

// HOME PAGE
app.get("/", (req, res) => {
    res.render("index");
});

app.get("/engineer/login", (req, res) => {

    res.render("engineer-login", {
        error: null
    });

});

app.post("/engineer/login", (req, res) => {

    const { username, password } = req.body;

    if(
        username === process.env.ENGINEER_USER &&
        password === process.env.ENGINEER_PASS
    ){

        req.session.isEngineer = true;

        req.session.engineerName = "Roshan";

        return res.redirect("/engineer/dashboard");

    }else{

        return res.render("engineer-login", {
            error: "Invalid Username or Password"
        });

    }

});

app.get("/admin/login", (req, res) => {

    res.render("admin-login", {
        error: null
    });

});

app.post("/admin/login", (req, res) => {

    const { username, password } = req.body;

    if(
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
){

        req.session.isAdmin = true;

        return res.redirect("/admin/dashboard");

    }else{

        return res.render("admin-login", {
            error: "Invalid Username or Password"
        });

    }

});

app.post("/track", async (req, res) => {

    try{

        const job = await Job.findOne({
            jobNumber: req.body.jobNumber.trim().toUpperCase()
        });

        if(!job){
            return res.json({
                success:false,
                message:"Invalid Job Card Number"
            });
        }

        // 1 hour lock check
        if(
            job.lockedUntil &&
            job.lockedUntil > new Date()
        ){
            return res.json({
                success:false,
                message:"Access blocked for 1 hour"
            });
        }

        const mobile =
        String(job.mobile || "");

        const last4 =
        mobile.slice(-4);

        if(req.body.accessCode !== last4){

            job.failedAttempts =
            (job.failedAttempts || 0) + 1;

            if(job.failedAttempts >= 3){

                job.lockedUntil =
                new Date(
                    Date.now() +
                    60 * 60 * 1000
                );

                job.failedAttempts = 0;
            }

            await job.save();

            return res.json({
                success:false,
                message:"Invalid Access Code"
            });
        }

        // success reset
        job.failedAttempts = 0;
        job.lockedUntil = null;

        await job.save();

        req.session.trackAccess =
        job.jobNumber;

        return res.json({
            success:true,
            redirect:
            `/job/${job.jobNumber}`
        });

    }catch(err){

        console.log(err);

        res.json({
            success:false,
            message:"Server Error"
        });
    }

});


app.get("/admin/add-job", checkAdmin, (req, res) => {

    res.render("add-job");

});

app.post("/admin/add-job", checkAdmin, async (req, res) => {

    try{

        const allJobs = await Job.find();

let maxJobNumber = 1000;

allJobs.forEach(job => {

    const currentNumber = parseInt(
        String(job.jobNumber).replace("JB", "")
    );

    if(!isNaN(currentNumber) && currentNumber > maxJobNumber){

        maxJobNumber = currentNumber;

    }

});

const autoJobNumber = "JB" + (maxJobNumber + 1);

        const newJob = await Job.create({

    jobNumber:req.body.jobNumber,
    customerName:req.body.customerName,
    mobile:req.body.mobile,
    brand:req.body.brand,
    modelNumber:req.body.modelNumber,
    serialNumber:req.body.serialNumber,
    problem:req.body.problem,
    jobDate:req.body.jobDate,
    status:"Pending"

});

const trackUrl = `https://snapshotrepair.in/job/${newJob.jobNumber}`;

const whatsappMessage =
`Hello ${newJob.customerName},


📋 *Job Card:* ${newJob.jobNumber}

💻 *Brand:* ${newJob.brand}

🖥 *Model:* ${newJob.modelNumber}

🔧 *Problem:* ${newJob.problem}

🌐 *Track Repair Status:*
https://snapshotrepair.in

🔐 *Access Code:*
Enter the last 4 digits of your mobile number.
(कृपया अपने मोबाइल नंबर के अंतिम 4 अंक दर्ज करें)

🙏 Thank you for choosing us.

*SNAPSHOT COMPUTER*
📞 +91 7770000493 | 8149295882`;

const whatsappUrl =
`https://wa.me/91${newJob.mobile}?text=${encodeURIComponent(whatsappMessage)}`;

res.send(`
    <script>
        alert('Job Card Created Successfully');
        window.location.href='${whatsappUrl}';
    </script>
`);

    }catch(err){

        console.log(err);

    }

});

app.get("/job/:jobNumber", async (req, res) => {

    try{

        const job = await Job.findOne({
            jobNumber:req.params.jobNumber
        });

        if(!job){
            return res.send("Job Card Not Found");
        }

        // CUSTOMER ACCESS CHECK
        if(
            !req.session.isAdmin &&
            req.session.trackAccess !== job.jobNumber
        ){
            return res.send("Unauthorized Access");
        }

        const trackUrl =
        `http://localhost:5000/job/${job.jobNumber}`;

        const qrCode =
        await QRCode.toDataURL(trackUrl);

        res.render("track", {
    job,
    qrCode,
    trackUrl,
    session: req.session
});

    }catch(err){

        console.log(err);

        res.send("Error Loading Job");

    }

});

app.get("/admin/dashboard", checkAdmin, async (req, res) => {

    try{

        let filter = {};

        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        // AGAR DATE SELECT KI HAI
        if(startDate && endDate){

            filter.jobDate = {
                $gte: startDate,
                $lte: endDate
            };

        }else{

        filter = {};

        }

        const jobs = await Job.find(filter).sort({
            createdAt:-1
        });

        let nextJobNumber = 1001;

        if(jobs.length > 0){

            const lastJob = jobs[0];

            const lastNumber = parseInt(
                String(lastJob.jobNumber).replace("JB", "")
            );

            if(!isNaN(lastNumber)){

                nextJobNumber = lastNumber + 1;

            }

        }

        res.render("dashboard", {
            jobs,
            nextJobNumber,
            startDate,
            endDate
        });

    }catch(err){

        console.log(err);
        res.send(err.message);

    }

});

app.get("/admin/live-jobs", checkAdmin, async (req, res) => {
    try {

        const jobs = await Job.find({
            status: {
                $nin: ["Completed", "Return"]
            }
        }).sort({ jobDate: -1 });

        // Next Job Number
        const lastJob = await Job.findOne().sort({ jobNumber: -1 });

        let nextJobNumber = 1;

        if (lastJob && lastJob.jobNumber) {
            const number = parseInt(
                String(lastJob.jobNumber).replace(/\D/g, "")
            );

            if (!isNaN(number)) {
                nextJobNumber = number + 1;
            }
        }

        res.render("live-jobs", {
            jobs,
            nextJobNumber
        });

    } catch (err) {

        console.log("LIVE JOBS ERROR:", err);

        res.status(500).send("Server Error");

    }
});

app.get("/admin/edit-job/:id", checkAdmin, async (req, res) => {

    try{

        const job = await Job.findById(req.params.id);

        if(!job){
            return res.send("Job Not Found");
        }

        res.render("edit-job", { job });

    }catch(err){

        console.log(err);
        res.send("Error loading edit page");

    }

});

app.post("/admin/edit-job/:id", checkAdmin, async (req, res) => {

    try{

        await Job.findByIdAndUpdate(req.params.id, {

            jobNumber: req.body.jobNumber,
            customerName: req.body.customerName,
            brand: req.body.brand,
            modelNumber: req.body.modelNumber,
            serialNumber: req.body.serialNumber,
            problem: req.body.problem,
            status: req.body.status,
            accessories: req.body.accessories

        });

        res.redirect("/admin/dashboard");

    }catch(err){

        console.log(err);
        res.send("Error updating job");

    }

});

app.get("/admin/delete-job/:id", checkAdmin, async (req, res) => {

    try{

        await Job.findByIdAndDelete(req.params.id);

        res.redirect("/admin/dashboard");

    }catch(err){

        console.log(err);
        res.send("Error deleting job");

    }

});

app.post("/admin/update-estimate/:id", checkAdmin, async (req, res) => {

    try{

        await Job.findByIdAndUpdate(req.params.id, {
            estimatedPrice: req.body.estimatedPrice
        });

        res.redirect("/admin/dashboard");

    }catch(err){

        console.log(err);
        res.send("Error updating estimate");

    }

});

app.post("/admin/update-payment/:id", checkAdmin, async (req, res) => {

    try{

        await Job.findByIdAndUpdate(req.params.id, {

            payment:req.body.payment

        });

        res.redirect("/admin/dashboard");

    }catch(err){

        console.log(err);
        res.send("Error updating payment");

    }

});

app.post("/admin/update-engineer/:id", checkAdmin, async (req, res) => {
    

    try{
         if(!req.session.isAdmin){
    return res.status(403).send("Unauthorized");
}

        console.log("BODY =>", req.body);

        const updatedJob = await Job.findByIdAndUpdate(

            req.params.id,

            {
                $set:{
                    repairEngineer: req.body.repairEngineer
                }
            },

            {
                new:true,
                runValidators:true
            }

        );

        console.log("UPDATED =>", updatedJob);

        res.json({
            success:true,
            repairEngineer: updatedJob.repairEngineer
        });

    }catch(err){

        console.log(err);

        res.status(500).json({
            success:false
        });

    }

});


app.get("/admin/khata", checkAdmin, async (req, res) => {

    try{

        const jobs = await Job.find({ payment: "Unpaid" });

        const groupedJobs = {};

        jobs.forEach(job => {

            // Case-insensitive key
            const key = job.customerName.trim().toLowerCase();

            if(!groupedJobs[key]){

                groupedJobs[key] = {
                    customerName: job.customerName.trim(),
                    jobs: [],
                    totalAmount: 0
                };

            }

            groupedJobs[key].jobs.push(job);

            groupedJobs[key].totalAmount += Number(job.estimatedPrice || 0);

        });

        res.render("khata", {
            parties: Object.values(groupedJobs)
        });

    }catch(err){

        console.log(err);
        res.send(err);

    }

});

app.post("/admin/khata-paid/:id", checkAdmin, async (req, res) => {

    try{

        await Job.findByIdAndUpdate(req.params.id, {
            payment: "Paid"
        });

        res.redirect("/admin/khata");

    }catch(err){

        console.log(err);
        res.send("Error");

    }

});

app.get("/admin/logout", (req, res) => {

    req.session.destroy();

    res.redirect("/admin/login");

});

app.get("/engineer/dashboard", checkEngineer, async (req, res) => {

    try {

        // Aaj se pichhle 7 din ki date
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const jobs = await Job.find({
            createdAt: {
                $gte: sevenDaysAgo
            },
            status: {
                $in: ["Pending", "In Progress"]
            }
        }).sort({
            createdAt: -1
        });

        res.render("engineer-dashboard", { jobs });

    } catch (err) {

        console.log("ENGINEER DASHBOARD ERROR:", err);

        res.status(500).send("Server Error");

    }

});

app.get("/engineer/live-jobs", checkEngineer, async (req, res) => {

    try {

        const jobs = await Job.find({
            status: {
                $in: ["Pending", "In Progress"]
            }
        }).sort({
            createdAt: -1
        });

        res.render("engineer-live-jobs", { jobs });

    } catch (err) {

        console.log("ENGINEER LIVE JOBS ERROR:", err);

        res.status(500).send("Server Error");

    }

});

app.post("/engineer/update-status/:id", checkEngineer, async (req, res) => {

    try{

        await Job.findByIdAndUpdate(req.params.id, {

            status:req.body.status

        });

        res.redirect("/engineer/dashboard");

    }catch(err){

        console.log(err);

    }

});

app.post("/engineer/update-remark/:id", checkEngineer, async (req, res) => {

    try {

        const updatedJob = await Job.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    remark: req.body.remark
                }
            },
            {
                new: true
            }
        );

        console.log("UPDATED JOB =>", updatedJob);
        console.log("REMARK FIELD =>", updatedJob.remark);

        res.redirect("/engineer/dashboard");

    } catch (err) {

        console.log(err);
        res.send("Error Saving Remark");

    }

});

app.get("/engineer/logout", (req, res) => {

    req.session.destroy();

    res.redirect("/engineer/login");

});

app.post("/admin/update-status/:id", checkAdmin, async (req, res) => {

    try{

        await Job.findByIdAndUpdate(req.params.id, {
            status:req.body.status
        });

        res.redirect("/admin/dashboard");

    }catch(err){

        console.log(err);
        res.send("Error updating status");

    }

});

app.get("/check-job/:jobNumber", async (req, res) => {

    try{

        const job = await Job.findOne({
            jobNumber:req.params.jobNumber
        });

        res.json({
            exists: !!job
        });

    }catch(err){

        res.json({
            exists:false
        });

    }

});

app.get("/admin/live-jobs", checkAdmin, async (req, res) => {
    try {

        const jobs = await Job.find({
            status: {
                $nin: ["Completed", "Return"]
            }
        }).sort({ jobDate: -1 });

        const lastJob = await Job.findOne().sort({ jobNumber: -1 });

        let nextJobNumber = 1;

        if (lastJob && lastJob.jobNumber) {

            const number = parseInt(
                String(lastJob.jobNumber).replace(/\D/g, "")
            );

            if (!isNaN(number)) {
                nextJobNumber = number + 1;
            }
        }

        res.render("live-jobs", {
            jobs,
            nextJobNumber
        });

    } catch (err) {

        console.log("LIVE JOBS ERROR:", err);

        res.status(500).send("Server Error");

    }
});

app.get("/engineer/live-jobs", checkEngineer, async (req, res) => {

    try {

        const jobs = await Job.find({
            repairEngineer: req.session.engineerName,
            status: {
                $nin: ["Completed", "Return"]
            }
        }).sort({ jobDate: -1 });

        console.log("ENGINEER NAME:", req.session.engineerName);
        console.log("LIVE JOBS FOUND:", jobs.length);

        res.render("engineer-live-jobs", {
            jobs: jobs
        });

    } catch (err) {

        console.log("ENGINEER LIVE JOB ERROR:", err);

        res.status(500).send("Server Error");

    }

});

// SERVER START
app.listen(5000, "0.0.0.0", () => {
    console.log("Server Running On Port 5000");
});