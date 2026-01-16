const sendOk = (res, data, status = 200) =>
    res.status(status).json({ success: true, data });

const sendErr = (res, code, message, status = 400) =>
    res.status(status).json({
        success: false,
        error: { code, message },
    });

export { sendOk, sendErr };