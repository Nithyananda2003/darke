// Author: Nithyananda R S - Improved version matching Maricopa pattern
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const formatDate = (month, day, year) => {
    try {
        const date = new Date(year, month - 1, day);
        const isValidDate = date &&
            date.getMonth() === month - 1 &&
            date.getDate() === day &&
            date.getFullYear() === year;

        if (!isValidDate) {
            throw new Error(`Invalid date: ${month}/${day}/${year}`);
        }
        return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    } catch (error) {
        console.error('Date formatting error:', error);
        return null;
    }
};

const getCurrentTaxYear = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 10 ? year + 1 : year;
};

const formatCurrency = (str) => {
    try {
        if (!str || typeof str !== 'string') return "$0.00";
        const cleaned = str.replace(/[^0-9.-]+/g, "");
        if (!cleaned || isNaN(parseFloat(cleaned))) return "$0.00";

        const number = parseFloat(cleaned);
        return `$${number.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    } catch (error) {
        console.error('Currency formatting error:', error);
        return "$0.00";
    }
};

const calculateDueDates = (year = getCurrentTaxYear()) => {
    try {
        const taxYear = parseInt(year);
        if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
            throw new Error('Invalid tax year');
        }

        const result = {
            firstHalf: {
                dueDate: formatDate(2, 21, taxYear),
                delqDate: formatDate(2, 22, taxYear),
                period: 'First Half'
            },
            secondHalf: {
                dueDate: formatDate(7, 18, taxYear),
                delqDate: formatDate(7, 19, taxYear),
                period: 'Second Half'
            },
            paymentTypes: ['Annual', 'Semi-Annual'],
            defaultPaymentType: 'Semi-Annual',
            taxYear: taxYear,
            displayYear: `${taxYear}`,
            formattedDueDates: "02/21 & 07/18"
        };

        return result;
    } catch (error) {
        console.error('Error in calculateDueDates:', error);
        return {
            taxYear: getCurrentTaxYear(),
            displayYear: `${getCurrentTaxYear()}`,
            formattedDueDates: "02/21 & 07/18",
            defaultPaymentType: 'Semi-Annual',
            currentPeriod: 'Unknown'
        };
    }
};

// Step 1: Check payment status - equivalent to ac_1
const dc_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://darkecountyrealestate.org/Parcel?Parcel=${account}`;
            const status = await page.goto(url, { waitUntil: "domcontentloaded" });

            await page.waitForSelector('#Location');

            const paymentStatus = await page.evaluate(() => {
                try {
                    const billTable = document.querySelector('table[title*="Taxes"]');
                    if (!billTable) return "$0.00"; // Equivalent to paid status in Maricopa

                    const title = billTable.getAttribute('title');
                    const yearMatch = title?.match(/\d{4}/);
                    if (!yearMatch) return "$0.00";

                    const rows = Array.from(billTable.querySelectorAll('tr'));
                    const netPaidRow = rows.find(row => row.textContent?.includes('NET PAID'));
                    const netDueRow = rows.find(row => row.textContent?.includes('NET DUE'));

                    if (!netPaidRow || !netDueRow) return "UNPAID";

                    const paidCells = netPaidRow.querySelectorAll('td');
                    const dueCells = netDueRow.querySelectorAll('td');

                    if (paidCells.length < 4 || dueCells.length < 4) return "UNPAID";

                    const firstHalfPaid = parseFloat(paidCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                    const secondHalfPaid = parseFloat(paidCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                    const firstHalfDue = parseFloat(dueCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                    const secondHalfDue = parseFloat(dueCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;

                    const totalDue = firstHalfDue + secondHalfDue;
                    const totalPaid = firstHalfPaid + secondHalfPaid;

                    // Return payment status like Maricopa's $0.00 pattern
                    if (totalDue <= 0 || (totalPaid > 0 && totalDue <= 0.01)) {
                        return "$0.00"; // All paid
                    } else if (firstHalfPaid > 0 && secondHalfDue > 0) {
                        return "PARTIAL"; // Partial payment
                    } else {
                        return `$${totalDue.toFixed(2)}`; // Amount due
                    }
                } catch (error) {
                    console.error('Error in page evaluation:', error);
                    return "UNPAID";
                }
            });

            resolve(paymentStatus);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Step 2: Extract basic property data - equivalent to ac_2
const dc_2 = async (page, paid_status, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Already on the correct page from dc_1
            const page_data = await page.evaluate(() => {
                const datum = {
                    processed_date: new Date().toISOString().split("T")[0],
                    order_number: "",
                    borrower_name: "",
                    owner_name: [],
                    property_address: "",
                    parcel_number: "",
                    land_value: "N/A",
                    improvements: "N/A",
                    total_assessed_value: "N/A",
                    exemption: "N/A",
                    total_taxable_value: "N/A",
                    taxing_authority: "Darke County Treasurer, 504 S. Broadway, Greenville, OH 45331, Ph: 937-547-7365",
                    notes: "",
                    delinquent: "",
                    tax_history: []
                };

                const findTableValue = (tableId, rowIndex, selector) => {
                    try {
                        const table = document.querySelector(`#${tableId} .table`);
                        if (!table) return "N/A";
                        const row = table.querySelector(`tr:nth-child(${rowIndex})`);
                        return row?.querySelector(selector)?.textContent?.trim() || "N/A";
                    } catch (error) {
                        console.error('Error finding table value:', error);
                        return "N/A";
                    }
                };

                try {
                    datum.owner_name[0] = findTableValue('Location', 2, '.TableValue');
                    datum.property_address = findTableValue('Location', 3, '.TableValue');

                    const valuationRow = document.querySelector('.table-responsive .table tbody tr:first-child');
                    if (valuationRow) {
                        datum.land_value = valuationRow.querySelector('td[headers="appraised appraisedLand"]')?.textContent?.trim() || "N/A";
                        datum.improvements = valuationRow.querySelector('td[headers="appraised appraisedImprovements"]')?.textContent?.trim() || "N/A";
                        datum.total_assessed_value = valuationRow.querySelector('td[headers="assessed assessedTotal"]')?.textContent?.trim() || "N/A";
                        datum.total_taxable_value = datum.total_assessed_value;
                    }
                } catch (error) {
                    console.error('Error extracting property data:', error);
                }

                return datum;
            });

            page_data.parcel_number = account;

            // Set notes and delinquent status like Maricopa pattern
            if (paid_status === "$0.00") {
                page_data.notes = "ALL PRIORS ARE PAID, 2024-2025 TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/21 & 07/18";
                page_data.delinquent = "NONE";
            } else if (paid_status === "PARTIAL") {
                page_data.notes = "ALL PRIORS ARE PAID, CURRENT YEAR 1ST HALF PAID, 2ND HALF DUE, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/21 & 07/18";
                page_data.delinquent = "YES";
            } else {
                page_data.notes = "ALL PRIORS ARE PAID, CURRENT YEAR TAXES ARE NOT PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 02/21 & 07/18";
                page_data.delinquent = "YES";
            }

            resolve({
                data: page_data,
                paid_status: paid_status
            });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Handle paid taxes - equivalent to ac_paid
const dc_paid = async (page, data) => {
    return new Promise(async (resolve, reject) => {
        try {
            const page_content = await page.evaluate(() => {
                let temp = [];
                
                try {
                    const table = document.querySelector('table[title="Tax Payments"]');
                    if (!table) return temp;

                    const rows = Array.from(table.querySelectorAll('tbody tr'));
                    let latestYear = null;

                    rows.forEach(row => {
                        try {
                            const cells = row.querySelectorAll("td");
                            if (cells.length < 7) return;

                            const datePaid = cells[0]?.textContent?.trim() || "";
                            const cycle = cells[1]?.textContent?.trim() || "";
                            const firstHalf = cells[3]?.textContent?.trim() || "";
                            const secondHalf = cells[4]?.textContent?.trim() || "";

                            const yearSuffix = cycle.split('-')[1];
                            if (!yearSuffix) return;
                            const year = `20${yearSuffix}`;

                            if (!latestYear) latestYear = year;
                            if (year !== latestYear) return;

                            let th_data = {
                                jurisdiction: "County",
                                year: year,
                                payment_type: "Semi-Annual",
                                status: "Paid",
                                base_amount: "",
                                amount_paid: "",
                                amount_due: "$0.00",
                                mailing_date: "N/A",
                                due_date: "",
                                delq_date: "",
                                paid_date: datePaid,
                                good_through_date: ""
                            };

                            const isFirstHalf = cycle.startsWith("1-");
                            if (isFirstHalf) {
                                const amount = firstHalf.replace(/[^0-9.-]+/g, "");
                                const formattedAmount = `$${parseFloat(amount || "0").toFixed(2)}`;
                                th_data.base_amount = formattedAmount;
                                th_data.amount_paid = formattedAmount;
                                th_data.due_date = `02/21/${year}`;
                                th_data.delq_date = `02/22/${year}`;
                            } else {
                                const amount = secondHalf.replace(/[^0-9.-]+/g, "");
                                const formattedAmount = `$${parseFloat(amount || "0").toFixed(2)}`;
                                th_data.base_amount = formattedAmount;
                                th_data.amount_paid = formattedAmount;
                                th_data.due_date = `07/18/${year}`;
                                th_data.delq_date = `07/19/${year}`;
                            }

                            temp.push(th_data);
                        } catch (error) {
                            console.error('Error processing payment row:', error);
                        }
                    });

                    return temp.reverse();
                } catch (error) {
                    console.error('Error in dc_paid evaluation:', error);
                    return temp;
                }
            });

            data.tax_history = page_content;

            // Update payment type based on number of payments
            if (data.tax_history.length === 1) {
                data.tax_history[0].payment_type = "Annual";
                data.notes = data.notes.replace("SEMI-ANNUALLY", "ANNUALLY");
            }

            resolve(data);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Handle unpaid taxes - equivalent to ac_unpaid  
const dc_unpaid = async (page, data) => {
    return new Promise(async (resolve, reject) => {
        try {
            const page_content = await page.evaluate(() => {
                let temp = [];
                
                try {
                    const taxTables = document.querySelectorAll('table[title*="Taxes"]');

                    taxTables.forEach(billTable => {
                        try {
                            const title = billTable.getAttribute('title');
                            const yearMatch = title?.match(/\d{4}/);
                            if (!yearMatch) return;
                            const year = yearMatch[0];

                            const rows = Array.from(billTable.querySelectorAll('tr'));
                            const netDueRow = rows.find(row => row.textContent?.includes('NET DUE'));

                            if (!netDueRow) return;

                            const dueCells = netDueRow.querySelectorAll('td');
                            if (dueCells.length < 4) return;

                            const dueFirstHalf = dueCells[2]?.textContent?.trim() || "";
                            const dueSecondHalf = dueCells[3]?.textContent?.trim() || "";

                            const parseAmount = (str) => parseFloat(str.replace(/[^0-9.-]+/g, "")) || 0;

                            // Add First Half if unpaid
                            if (parseAmount(dueFirstHalf) > 0) {
                                let th_data = {
                                    jurisdiction: "County",
                                    year: year,
                                    payment_type: "Semi-Annual", 
                                    status: "Unpaid",
                                    base_amount: `$${parseAmount(dueFirstHalf).toFixed(2)}`,
                                    amount_paid: "$0.00",
                                    amount_due: `$${parseAmount(dueFirstHalf).toFixed(2)}`,
                                    mailing_date: "N/A",
                                    due_date: `02/21/${year}`,
                                    delq_date: `02/22/${year}`,
                                    paid_date: "",
                                    good_through_date: ""
                                };
                                temp.push(th_data);
                            }

                            // Add Second Half if unpaid
                            if (parseAmount(dueSecondHalf) > 0) {
                                let th_data = {
                                    jurisdiction: "County",
                                    year: year,
                                    payment_type: "Semi-Annual",
                                    status: "Unpaid", 
                                    base_amount: `$${parseAmount(dueSecondHalf).toFixed(2)}`,
                                    amount_paid: "$0.00",
                                    amount_due: `$${parseAmount(dueSecondHalf).toFixed(2)}`,
                                    mailing_date: "N/A",
                                    due_date: `07/18/${year}`,
                                    delq_date: `07/19/${year}`,
                                    paid_date: "",
                                    good_through_date: ""
                                };
                                temp.push(th_data);
                            }
                        } catch (error) {
                            console.error('Error processing unpaid tax table:', error);
                        }
                    });

                    return temp;
                } catch (error) {
                    console.error('Error in dc_unpaid evaluation:', error);
                    return temp;
                }
            });

            data.tax_history = [...page_content];
            resolve(data);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Main orchestrator function - equivalent to account_search
const account_search = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            dc_1(page, account)
                .then((paid_status) => {
                    dc_2(page, paid_status, account)
                        .then((data2) => {
                            if (data2['paid_status'] === "$0.00") {
                                dc_paid(page, data2['data'])
                                    .then((data3) => {
                                        resolve(data3);
                                    })
                                    .catch((error) => {
                                        console.log(error);
                                        reject(error);
                                    });
                            } else {
                                dc_unpaid(page, data2['data'])
                                    .then((data3) => {
                                        resolve(data3);
                                    })
                                    .catch((error) => {
                                        console.log(error);
                                        reject(error);
                                    });
                            }
                        })
                        .catch((error) => {
                            console.log(error);
                            reject(error);
                        });
                })
                .catch((error) => {
                    console.log(error);
                    reject(error);
                });
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

// Main search function - matches Maricopa exactly
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let browser = null;
    let context = null;
    
    try {
        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        browser = await getBrowserInstance();
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND POINT
            account_search(page, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render('error_data', {
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    if (page && !page.isClosed()) {
                        await page.close();
                    }
                    if (browser && browser.isConnected()) {
                        await browser.close();
                    }
                });
        } else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, account)
                .then((data) => {
                    res.status(200).json({
                        result: data
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message
                    });
                })
                .finally(async () => {
                    if (page && !page.isClosed()) {
                        await page.close();
                    }
                    if (browser && browser.isConnected()) {
                        await browser.close();
                    }
                });
        }

    } catch (error) {
        console.log(error);
        
        // Clean up resources
        try {
            if (page && !page.isClosed()) {
                await page.close();
            }
            if (browser && browser.isConnected()) {
                await browser.close();
            }
        } catch (cleanupError) {
            console.log('Cleanup error:', cleanupError);
        }

        if (fetch_type == "html") {
            res.status(200).render('error_data', {
                error: true,
                message: error.message
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message
            });
        }
    }
};

export { search };