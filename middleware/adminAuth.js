module.exports = function adminAuth(req, res, next) {
    const expectedUser = process.env.ADMIN_USER     || 'admin';
    const expectedPass = process.env.ADMIN_PASSWORD || 'admin';

    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="PizzaLand Admin"');
        return res.status(401).send('Admin access required');
    }

    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (user !== expectedUser || pass !== expectedPass) {
        res.set('WWW-Authenticate', 'Basic realm="PizzaLand Admin"');
        return res.status(401).send('Invalid credentials');
    }

    next();
};
