const UserModel = require('../model/UserModel');
const CALENDAR_LINK = "https://calendar.app.google/mepp8MDWBPF24WQ28";


const interestedUser = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Find the specific lead and update their info
        const lead = await UserModel.findByIdAndUpdate(
            id,
            { 
                status: 'INTERESTED', 
                interestedAt: new Date(),
                // Capture browser info to prove it's a real click
                'clickMetadata.userAgent': req.headers['user-agent']
            },
            { new: true } // Returns the updated document
        );

        if (!lead) {
            return res.status(404).send("Lead record not found.");
        }

        console.log(`\n🔥 SUCCESS: ${lead.name} (${lead.email}) just clicked INTERESTED!`);
        console.log(`Details stored in DB at: ${lead.interestedAt}`);

        // 2. Redirect them to your calendar
        return res.redirect(CALENDAR_LINK);

    } catch (err) {
        console.error("Error capturing interest:", err);
        res.status(500).send("Server error");
    }
};

// ... notInterestedUser logic remains the same
const notInterestedUser = async (req, res) => {
    try {
        const { id } = req.params;
        await UserModel.findByIdAndUpdate(id, { status: 'NOT_INTERESTED' });
        return res.send("Thanks! We won’t contact you again.");
    } catch (err) {
        res.status(500).send("Server error");
    }
};

module.exports = { interestedUser, notInterestedUser };