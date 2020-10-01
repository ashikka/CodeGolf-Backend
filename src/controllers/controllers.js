const jwt = require('jsonwebtoken');
const {
    User,
    Question,
    Leaderboard,
    Testcases,
} = require('../models/models.js');
const executeCode = require('./code-executor');

const updateLeaderboard = require('./leaderboard');

// TO CHECK IF USER EXISTS AND SEND JWT
exports.login = async (req, res) => {
    try {
        // Get token id of user from body
        const { id } = req.body;

        // Check if user exists
        const currentUser = await User.findById(id);

        // Send error message is user doesn't exist
        if (!currentUser) {
            res.status(403).json({
                status: 'failure',
                error: 'invalid login url',
            });
        }

        // Sign token and send it if user exists
        const token = jwt.sign({ id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN,
        });
        res.status(200).json({
            status: 'success',
            token,
        });
    } catch (error) {
        res.status(401).json({
            status: 'failure',
            error: 'unsuccessful login',
        });
    }
};

// CHECK IF USER IS LOGGED IN
exports.isLoggedIn = (req, res, next) => {
    // Get authorization header
    const header = req.headers.authorization;

    // Send error message if no authorization header
    if (!header) {
        res.status(403).json({
            status: 'failure',
            error: 'not logged in',
        });
        return;
    }

    // If authorization header exists get the bearer token and verify it
    try {
        const bearer = header.split(' ');
        const token = bearer[1];
        req.userId = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        res.sendStatus(401);
    }
};

// GET DETAILS ABOUT ALL THE QUESTIONS DETAILS FROM DB
exports.getQuestions = async (req, res) => {
    try {
        const questions = await Question.find({ round: 1 });
        // console.log('Questions: ', questions);
        res.status(200).json({
            status: 'success',
            questions,
        });
    } catch (error) {
        res.status(402).json({
            status: 'failure',
            error: 'Error fetching questions',
        });
    }
};

// GET THE LEADER BOARD FOR A PARTICULAR QUESTION
exports.getLeaderboard = async (req, res) => {
    try {
        // Get question number for req body
        const { questionName } = req.body;

        // Fetch leaderboard
        const questionLeaderboard = await Leaderboard.findOne({
            questionName,
        });

        // Send error message if invalid question number
        if (!questionLeaderboard) {
            res.json({
                status: 'failure',
                error: 'Invalid question number',
            });
        }

        // Else send success and the leaderboard
        res.status(200).json({
            status: 'success',
            questionLeaderboard,
        });
    } catch (error) {
        res.status(401).json({
            status: 'failure',
            error: 'Error fetching leaderboard',
        });
    }
};

// SUBMIT THE RESPONSE TO CALCULATE AND UPDATE DB AND LEADERBOARD IF REQUIRED
exports.submit = async (req, res) => {
    // // Send submission to compiler and get response
    const {
        questionName, code, language, submitTime,
    } = req.body;
    const testCases = await Testcases.findOne({ questionName });

    const inputArray = testCases.inputs;
    const outputArray = testCases.outputs;

    const testCasesCE = [];

    inputArray.forEach((input, i) => {
        const obj = {};
        obj.input = input;
        obj.output = outputArray[i];
        testCasesCE.push(obj);
    });

    const compilerResponse = await executeCode(language, code, testCasesCE);
    const compilerResponseJSON = JSON.parse(compilerResponse);

    const currentUser = await User.findById(req.userId);

    const currentQsLeaderboard = await Leaderboard.find({ questionName });
    const currentUserInLeaderboard = currentQsLeaderboard.users.find(
        (user) => user.username === currentUser.username,
    );

    const allTestCasesPass = compilerResponseJSON.tests.find(
        (test) => test.remarks !== 'Pass',
    );

    if (allTestCasesPass) {
        if (
            !currentUserInLeaderboard
            || currentUserInLeaderboard.slength > code.length
        ) {
            // If not exists update score and return success message
            // OR
            // If better submission then update score and return success message

            // eslint-disable-next-line no-undef
            updateLeaderboard(
                currentUser.username,
                questionName,
                submitTime,
                code.length,
                currentUserInLeaderboard,
            );
            res.status(200).json({
                status: 'success',
                message: 'Submission Successful',
                compilerResponse: compilerResponseJSON,
            });
        }
        // Return better submission for the question already submitted
        res.json({
            status: 'failure',
            message: 'Better submission already done',
            compilerResponse: compilerResponseJSON,
        });
    }

    res.json({
        status: 'failure',
        message: 'Did not pass all test cases',
        compilerResponse: compilerResponseJSON,
    });
};
