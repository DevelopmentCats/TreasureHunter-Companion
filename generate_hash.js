import bcrypt from 'bcrypt';

const saltRounds = 10;
const password = 'Jennifer@97';

bcrypt.hash(password, saltRounds, function(err, hash) {
    if (err) {
        console.error('Error generating hash:', err);
    } else {
        console.log('New hash:', hash);
    }
});
