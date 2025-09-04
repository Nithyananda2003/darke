// Author: Nithyananda R S - 
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

//equivalent to ac_1
const dc_1 = async (page, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://darkecountyrealestate.org/Parcel?Parcel=${account}`;
            const status = await page.goto(url, { waitUntil: "domcontentloaded" });

            await page.waitForSelector('#Location', { timeout: 90000 });

            const paymentStatus = await page.evaluate(() => {
                try {
                    const billTable = document.querySelector('table[title*="Taxes"]');
                    if (!billTable) return "$0.00";
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

                
                    if (totalDue <= 0 || (totalPaid > 0 && totalDue <= 0.01)) {
                        return "$0.00"; 
                    } else if (firstHalfPaid > 0 && secondHalfDue > 0) {
                        return "PARTIAL"; 
                    } else {
                        return `$${totalDue.toFixed(2)}`; 
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

const dc_2 = async (page, paid_status, account) => {
    return new Promise(async (resolve, reject) => {
        try {
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

                try {
                    // Use more specific selectors for reliability
                    const locationTable = document.querySelector('#Location .table');
                    if (locationTable) {
                        const ownerRow = locationTable.querySelector('tr:nth-child(2)');
                        const addressRow = locationTable.querySelector('tr:nth-child(3)');
                        datum.owner_name[0] = ownerRow?.querySelector('.TableValue')?.textContent?.trim() || "N/A";
                        datum.property_address = addressRow?.querySelector('.TableValue')?.textContent?.trim() || "N/A";
                    }

                    const valuationTable = document.querySelector('.table-responsive .table');
                    if (valuationTable) {
                        const firstDataRow = valuationTable.querySelector('tbody tr:first-child');
                        if (firstDataRow) {
                            datum.land_value = firstDataRow.querySelector('td[headers="appraised appraisedLand"]')?.textContent?.trim()?.split('(')[0]?.trim() || "N/A";
                            datum.improvements = firstDataRow.querySelector('td[headers="appraised appraisedImprovements"]')?.textContent?.trim() || "N/A";
                            datum.total_assessed_value = firstDataRow.querySelector('td[headers="assessed assessedTotal"]')?.textContent?.trim() || "N/A";
                            datum.total_taxable_value = datum.total_assessed_value;
                        }
                    }

                } catch (error) {
                    console.error('Error extracting data:', error);
                }

                return datum;
            });

            page_data.parcel_number = account;
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
                            const isSecondHalf = cycle.startsWith("2-");
                            const firstHalfAmount = parseFloat(firstHalf.replace(/[^0-9.-]+/g, "")) || 0;
                            const secondHalfAmount = parseFloat(secondHalf.replace(/[^0-9.-]+/g, "")) || 0;

                            if (firstHalfAmount > 0 && secondHalfAmount > 0) {
                                // Annual payment case
                                const totalAmount = firstHalfAmount + secondHalfAmount;
                                const formattedAmount = `$${totalAmount.toFixed(2)}`;
                                th_data.base_amount = formattedAmount;
                                th_data.amount_paid = formattedAmount;
                                th_data.payment_type = "Annual";
                                th_data.due_date = `07/18/${year}`; // The last due date for the annual payment
                                th_data.delq_date = `07/19/${year}`;
                            } else if (isFirstHalf && firstHalfAmount > 0) {
                                // First half payment
                                const formattedAmount = `$${firstHalfAmount.toFixed(2)}`;
                                th_data.base_amount = formattedAmount;
                                th_data.amount_paid = formattedAmount;
                                th_data.due_date = `02/21/${year}`;
                                th_data.delq_date = `02/22/${year}`;
                            } else if (isSecondHalf && secondHalfAmount > 0) {
                                // Second half payment
                                const formattedAmount = `$${secondHalfAmount.toFixed(2)}`;
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
            if (data.tax_history.length > 0 && data.tax_history[0].payment_type === "Annual") {
                data.notes = data.notes.replace("SEMI-ANNUALLY", "ANNUALLY");
            }

            resolve(data);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};
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

// Main search function
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    
    try {
        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render('error_data', {
                error: true,
                message: "Invalid Access"
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
        page.setDefaultNavigationTimeout(90000);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
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
                    await context.close();
                });
        } else if (fetch_type == "api") {

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
                    await context.close();
                });
        }
    } catch (error) {
        console.log(error);
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
