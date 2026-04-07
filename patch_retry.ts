    let retryCount = 0;
    const maxRetries = 2;
    while (true) {
        try {
            await session.prompt(userInput);
            break;
        } catch (error: any) {
            if (retryCount < maxRetries && error && error.message && error.message.includes("ECONNRESET")) {
                retryCount++;
                console.warn(`[runPolishAgent] ECONNRESET error encountered. Retrying (${retryCount}/${maxRetries})...`);
                // Wait briefly before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                continue;
            }
            throw error;
        }
    }
