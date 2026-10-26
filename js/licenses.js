// License text, fetched once per file and shared by the pop-up and the credits reader
const licenseCache = new Map();
export const loadLicense = (file) => {
    if (!licenseCache.has(file)) {
        licenseCache.set(file, fetch(`/assets/licenses/${file}`).then(response => {
            if (!response.ok) throw new Error('Failed to load license');
            return response.text();
        }).catch(error => {
            licenseCache.delete(file);
            throw error;
        }));
    }
    return licenseCache.get(file);
};
export const licenseError = 'Error loading license text. Please try again later.';
