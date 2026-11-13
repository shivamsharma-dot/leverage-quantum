# Manager EBITDA: change log

Every change made to the Manager EBITDA sheets, the Quantum page and the Slack report, with the reason, the exact cells, and before / after numbers. Use this to answer "why does this show like this" and "why doesn't this number match".

Newest entries are at the bottom. Dates are IST.

---

## 0. Where things live

| Thing | Where |
|---|---|
| Live workbook (November, current month) | "Manager and SM-level EBITDA Live", ID `1TVEjyPeKq7BN2B3hdgwm5xUV9lykknY8DuJkhjuWles` |
| October workbook (separate copy, own formulas, NOT frozen) | "Manager and SM-level EBITDA - October", ID `19jiItg-r5iveLGPjtZrZsIUI4OvQIK03A4PLNLUfZik` |
| CIB (AC / VAS revenue) | Finance workbook "Source wise CIB - updated", ID `1MIbHGyTHLo_WnthZxAX_ZRFokPo83JBIWs1n4_QYzFs`, one tab per month: `Oct Live 2026`, `Nov Live 2026` |
| SR deposits | BigQuery Connected Sheet in the live workbook (tab `SR Deposits`), query saved at `docs/ebitda/sr-deposits-query.sql` |
| Quantum page | `/dashboard/manager-ebitda` (`src/pages/ManagerEbitdaDashboard.jsx`), reads the sheets live |
| Quantum code | `lib/ebitdaManagerReport.mjs` (`EBITDA_MONTHS` lists each month's workbook + tab), `api/send-report.mjs` `handleEbitdaManagerView` |
| In-sheet change log | Live workbook, tab `How It Works`, CHANGE LOG section at the bottom |

### Live workbook tabs that matter

- **Team Mapping**: one row per person. Columns A to O are typed (Employee Number, Name, DOJ, DOE, Department, Designation, Email, Manager Emp No, Reporting To, Managers Manager Emp No, Managers Manager Name, Category, Monthly Salary, Is Manager?, Relevant for Marketing). Columns P to AC are formulas that spill down from row 3 (SR / AC / VAS revenue, product cost, U actual people cost, V allocated people cost, W corp salary, X corp OH, Y marketing, Z offline centre, AA partner payout, total cost).
  - There are no person-level salaries. People cost is always a team total (from Shubham Bansal) divided by the team's headcount.
  - Column N is `=I<row>=B<row>` per row (TRUE when the person reports to themselves, i.e. is a manager).
  - As of 5 Nov 2026 the data runs to row 428. Some helper formulas use fixed ranges `$3:$428`. They grow by themselves when rows are inserted INSIDE the range (insert above the last row, never append below it).
- **Mapping Summary + People Costs**: the people-cost pivot at A298:C344 (manager, people, monthly cost; D = per head = C/B), Grand Total row 345, row 346 = Grand Total x 23/31 (old helper, not used by Team Mapping).
  - These are team totals from Shubham Bansal, typed. Where we changed them the cell holds a formula like `=467501/8*7` so the original total and count stay visible.
- **EBITDA - November**: the report.
  - Helper cells in column S: S1 report month (blank = current month), S2 cost-base headcount, S3 marketing YES rows, S4 share of month elapsed, S5 marketing spend MTD, S6 "effective today", S7 rent headcount, S8 laptop headcount, S12 / S13 Nigeria / Malaysia spend, S17 month start, S18 month text.
  - Blocks: consolidated A6:N13, AC 16/17/18-47, SR 49/50/51-70, VAS 72/73/74-83, Offline 85/86/87-106, Difference 108/109/110-149, reconciliation 152-155, Excluded 158+.
- **EBITDA - October**: IMPORTRANGE of the October workbook's `'EBITDA - October'!A1:N260`.
- **EBITDA - Combined**: per manager, November + October summed (LET / UNIQUE / VSTACK / SUMIFS formulas). Team size shows "November (October)", it is never added across months.
- **PnL Import**: B2C P&L tab import. U3:U18 hold the month cost totals (currently the September actuals, "Total for Sep") that every cost column is built from.
- **Swap**, **addition**: input tabs the owner made on 5 Nov 2026 (team moves, new joiners).

---

## 1. How each cost is calculated (so you can explain any number)

All figures are month to date: monthly figure x S4 (share of month elapsed up to yesterday; for example 4/30 = 0.1333 on 5 Nov).

- **Actual people cost (Team Mapping U)** = (team's pivot cost / team's pivot headcount) x S4. The person's own "Reporting To" (column I) picks the team. If the manager has no pivot row, U = 0.
- **Allocated people cost (V)** = (P&L people cost U3 minus the pivot Grand Total) / S2 (cost-base headcount) x S4. The part of the P&L people cost not covered by the pivot is spread equally over everyone in the cost base. Leavers and senior managers (Reporting To NA) are not in a pivot team, so their salary lands here.
- **Cost base (S2)** = people whose category is AC, SR, VAS or Offline AND Reporting To is not NA.
- **Rent (part of X)**: P&L rent split equally over the S7 headcount (cost base minus Nigeria, Malaysia and Offline departments). **Laptop rent**: split over the S8 headcount (cost base minus Nigeria and Malaysia).
- **Marketing (Y)**: P&L PM cost MTD, minus the offline share, minus Nigeria / Malaysia Facebook spend (each split over its own department), the rest split equally over the "Relevant for Marketing = YES" rows.
- **Product cost** = 0.2 x AC revenue + 0.9 x VAS revenue. **Partner payout** = 0.5 x (revenue minus product cost) where Revenue Adjustments column D says YES.
- **SR revenue (P)** = the person's deposits in `SR Deposits` x Rs 2,62,500 (Rs 3.5 L x 75%).
- **AC / VAS revenue** = CIB amount x 0.90 (AC) / x 0.95 (VAS), matched on the coach email.

### Why the table's people cost is not exactly P&L people x S4

Total people cost = S4 x (P&L people + sum over teams of (actual Team Mapping headcount minus pivot headcount) x per head).

So whenever a team has more or fewer people in Team Mapping than its pivot row says, the total drifts a little.
- Before 5 Nov swaps: table 36,65,018 vs P&L 2,74,39,397 x 0.1333 = 36,58,586 (+6,432).
- After the swaps: 36,72,713 (+14,127).

Known pivot vs Team Mapping mismatches seen on 5 Nov (pre-existing, not created by us; the team totals come from Shubham Bansal):
- **Siddharth:** pivot 9, Team Mapping about 11 before the swaps (his own row plus others pointing at him).
- **Ayushi Kushwaha:** pivot 5, Team Mapping about 6 before the addition.

These are worth reconciling with Shubham Bansal when October actuals come in.

---

## 2. History before 5 Nov 2026 (short)

- **27 Oct**
  - Gautam Makhija's own marketing added to his row.
  - Nigeria / Malaysia spend split by department.
  - Rent and laptop rent split by headcount.
  - Revenue Adjustments: coaches not in Team Mapping counted under a manager (Luna under Dhiman Dey with partner payout; Nikita and Harsh under Gautam Makhija).
- **28 Oct**: Quantum page `/dashboard/manager-ebitda` built. The 3 PM auto post is off; sending is manual from the page.
- **30 Oct**: Suraj Kumar (suraj.kumar4) removed; pivot Swati Sharma 5 to 4 (295,305 to 236,244).
- **2 Nov**: October report sent to Slack (evening).
- **3 Nov**
  - October workbook created as a copy. It stays live, not frozen, because October costs will be replaced with October actuals later.
  - Live workbook switched to November: S1 cleared, the SR query set to the live line, `Nov Live 2026` created in the CIB workbook, tabs renamed to `EBITDA - November` / `EBITDA - October`, Combined tab built.
  - Quantum got the Combined / October / November picker.
- **3 Nov, leavers** (counted in October only):
  - Saksham Tyagi (Varsha Baliyan) and Altamash Khan (Srishti Prasad): Reporting To = NA and marketing flag cleared in November.
  - Later on 5 Nov their teams were reduced in the pivot (Varsha 6 to 5, `=274767/6*5`; Srishti 8 to 7, `=467501/8*7`) so their per-head share moves to the shared pool, like Suraj.
- **5 Nov, Himanshu Gupta team**
  - 7 joiners added (rows 395 to 401).
  - Dhananjay Singh moved Swati to Joydeep.
  - Srishti Pandey left, last day 31 Oct (Reporting To NA, DOE 31 Oct).
  - Himanya Singh added under Swati (row 402).
  - Pivot: Arya 8 (`=292500/6*8`), Joydeep 9 (`=409934/6*9`), Swati 4 (`=236244/4*4`), Vishesh 8 (`=289433/6*8`).
- **5 Nov**: How It Works A17:B18 and A25:B27 now read S2 / S6 / S7 / S8 live instead of typed counts.
- **5 Nov**: Priyanka Kalra and Itisha Singh keep a blank category and no marketing flag, so they have zero revenue and zero cost until confirmed.

---

## 3. 5 Nov 2026: Swap tab + Addition tab (November only)

**Rule agreed with the owner:**
- Every change is effective from 1 Nov 2026.
- October stays exactly as sent. The October workbook has its own Team Mapping and was not touched; checked after the changes, its total row still reads cost 14,06,46,993 and EBITDA -3,38,56,036.
- Real October joining dates in the live Team Mapping do not change October either, because no formula uses DOJ.

### 3.1 Existing rows corrected to match the Addition tab (HR source)

| Row | Person | Before | After |
|---|---|---|---|
| 395 | Mahir Singh | no emp no, DOJ 1 Nov, name "Mahir Singh" | E5203, DOJ 12 Oct 2026, "Mahir Singh Sikand" |
| 396 | Kaushik Rajput | no emp no, DOJ 1 Nov | E5213, 12 Oct 2026 |
| 397 | Akash Jaiswal | no emp no, DOJ 1 Nov | E5265, 19 Oct 2026 |
| 398 | Nishant Singh | no emp no, DOJ 1 Nov, "Nishant Singh" | E5226, 12 Oct 2026, "Nishant" |
| 399 | Suraj Kumar | no emp no, DOJ 1 Nov | E5179, 5 Oct 2026 |
| 400 | Prashant Srivastava | no emp no, DOJ 1 Nov | IN0623, 19 Oct 2026 |
| 401 | Saksham Sharma | no emp no, DOJ 1 Nov, saksham.sharma@ | E5246, 19 Oct 2026, saksham.sharma2@leverageedu.com |
| 244 | Rai Sweta Rohinikumar | H E4388, K Manish Kumar Singh, N blank | H E2251 (Vishesh), J E4388, K Himanshu Gupta, N formula |
| 249 | Siddhant Parashar | I NA, K "Siddhant Parashar", L blank, O blank | H E2373, I Aditya Gupta, J E4708, K Deepak Panwar, L AC, O YES |

Their team, category, department, designation and marketing flag already matched.

**Not applied:** Addition tab row 2 ("Manav Sharma", IN0620, Intern, DOJ 5 Nov, but with Ashlok Adarsh's email).
- Team Mapping already has these as two people: Ashlok Adarsh E4948 (SR, Harsha Sudan, row 209) and Manav Sharma IN0620 (Intern, Sahil Goyal, row 252).
- The owner will close this later.

### 3.2 Swaps (Swap tab)

| Row | Person | From | To | H / J / K written |
|---|---|---|---|---|
| 248 | Robin Pal | Siddharth | Ashish Dhawan | E2936 / E1622 / Mohd Saud Khan |
| 107 | Sahil Sharma | Srishti Prasad | Aditya Gupta | E2373 / E4708 / Deepak Panwar |
| 70 | Aditya Gupta | Srishti Prasad (member) | Manager of his own team (I = Aditya Gupta) | E4708 / E2579 / Deepak Panwar |
| 249 | Siddhant Parashar | NA (was outside everything) | Aditya Gupta | see 3.1 |
| 16 | Diksha Chhabra | Vishal Jain | Mayur Bajaj | E0507 / E4409 / Shubham Sachdeva |
| 13 | Rukhsar Khatoon | Vishal Jain | Shubham Sachdeva (direct) | E4409 / E0068 / Shubham Sachdeva |
| 14 | Mohini Singh | Vishal Jain | Shubham Sachdeva (direct) | same |
| 15 | Dipika Bhattacharya | Vishal Jain | Shubham Sachdeva (direct) | same |
| 250 | Dhananjay Singh | (already done earlier on 5 Nov) | Joydeep Mohanty | |

**Shubham Sachdeva's direct team.**
- A team row called "Shubham Sachdeva" now appears in the AC table, because 5 people have Reporting To = "Shubham Sachdeva": Rukhsar, Mohini, Dipika, and the new joiners Sheikh Anam Javid and Nishant Kumar.
- Team size 5. Shubham himself (row 138) keeps Reporting To = NA, so he is not counted in that row and his salary stays in the shared pool (V).
- This follows the Swap tab note: "Do not take actual salary of Shubham Sachdeva as he is a SM".

**Vishal Jain.**
- His team is now just himself (row 17, Reporting To = Vishal Jain).
- His people cost uses his old team's per head (77,133.6), which includes a manager's salary.
- The owner is checking with Shubham whether Vishal has left. If he has: set Reporting To = NA, clear the marketing flag, and delete or zero his pivot row.

### 3.3 New joiners added (Addition tab), Team Mapping rows 403 to 427

- 25 rows were inserted above the old row 403 (Riya Aggarwal, now row 428), so all fixed ranges grew from `$403` to `$428`.
- Every row has: department B2C - Online, the real October DOJ, the employee number, H / J looked up from the manager's own row, N = `=I<row>=B<row>`, and O = YES except Mansi Tomar (VAS, no marketing flag, as in the Addition tab).

| Rows | Manager | People |
|---|---|---|
| 403 | Ayushi Kushwaha (SR) | Swechha Srivastava E5195 |
| 404 | Siddharth | Nishant Pandey E5230 |
| 405-408 | Ashish Dhawan | Shankey Sharma E5234, Rajan Tiwari E5253, Kumar Pritish E5260, Abhinav Kumar E5267 |
| 409-410 | Shanawaz Khan | Yasharsh Tripathi E5212, Gitanjali Giri E5227 |
| 411-413 | Sidhanth Bedi | Shubham Bhartia E5216, Akshendra Raj E5218, Pragya Singh E5241 |
| 414, 416 | Aman Raj Keshari | Faraz Ahmed E5231, Saloni Garg E5255 |
| 415 | Aditya Gupta | Anshuman Pandey E5196 (email ansuman.pandey@, as in the tab) |
| 417-418 | Srishti Prasad | Radhika Sharma E5262, Stuti Bajaj E5251 |
| 419 | Ravi Pratap Singh Chauhan (VAS) | Mansi Tomar E5272 |
| 420-421 | Shubham Sachdeva (direct) | Sheikh Anam Javid E5201, Nishant Kumar E5206 |
| 422-424 | Amit Tomar | Sahil Gulati E5220, Nishtha E5229, Ankit Parashar E5232 |
| 425-427 | Ritesh Kumar | Rupam Priya E5202, Sweety Kushwaha E5210, Saurabh Singh E5215 |

All of them joined in October (5 to 19 Oct) but count only in November, per the owner.

### 3.4 People-cost pivot (Mapping Summary + People Costs)

**Rules:**
- A mover takes -1 from the old team and +1 on the new team, each at that team's per head.
- A new joiner takes +1 at the team's current per head.
- New teams (Aditya Gupta, Shubham Sachdeva direct) use Srishti Prasad's per head of 58,437.6 (owner's choice; Vishal's 77,134 was rejected as too high).
- Two rows were inserted above Dhiman Dey so the pivot range grew from A298:C342 to A298:C344; Team Mapping U / V picked this up automatically.

| Row | Manager | Before (people / cost) | After | Cell formula | Why |
|---|---|---|---|---|---|
| 303 | Ravi Pratap Singh Chauhan | 9 / 4,95,533 | 10 / 5,50,592 | `=495533/9*10` | +Mansi Tomar |
| 304 | Sidhanth Bedi | 8 / 4,94,167 | 11 / 6,79,480 | `=494167/8*11` | +3 joiners |
| 309 | Vishal Jain | 5 / 3,85,668 | 1 / 77,134 | `=385668/5*1` | Rukhsar, Mohini, Dipika, Diksha moved out |
| 310 | Ritesh Kumar | 7 / 3,76,101 | 10 / 5,37,287 | `=376101/7*10` | +3 joiners |
| 311 | Aman Raj Keshari | 6 / 3,74,867 | 8 / 4,99,823 | `=374867/6*8` | +2 joiners |
| 313 | Mayur Bajaj | 6 / 3,70,832 | 7 / 4,32,637 | `=370832/6*7` | +Diksha |
| 318 | Ayushi Kushwaha | 5 / 2,92,084 | 6 / 3,50,501 | `=292084/5*6` | +Swechha |
| 326 | Amit Tomar | 6 / 2,59,166 | 9 / 3,88,749 | `=259166/6*9` | +3 joiners |
| 329 | Ashish Dhawan | 4 / 2,30,834 | 8 / 4,61,668 | `=230834/4*8` | +Robin, +4 joiners |
| 331 | Shanawaz Khan | 3 / 2,24,167 | 5 / 3,73,612 | `=224167/3*5` | +2 joiners |
| 342 (new) | Aditya Gupta | none | 4 / 2,33,751 | `=467501/8*4` | Aditya, Sahil, Siddhant, Anshuman |
| 343 (new) | Shubham Sachdeva | none | 5 / 2,92,188 | `=467501/8*5` | Rukhsar, Mohini, Dipika, Sheikh, Nishant Kumar |
| 306 | Srishti Prasad | 7 / 4,09,063 | unchanged | | -Sahil, -Aditya, +Radhika, +Stuti |
| 300 | Siddharth | 9 / 5,67,766 | unchanged | | -Robin, +Nishant Pandey |

Pivot Grand Total: 256 / 1,49,62,233 before, **281 / 1,63,36,234 after**.

Effect on the shared pool: P&L people (2,74,39,397) minus pivot total is now 1,11,03,163 (was 1,24,77,164), split over 283 cost-base people instead of 257. So every person's allocated people cost (V) went down, while the named teams got their own per head.

### 3.5 Check after the changes (EBITDA - November, 5 Nov, month to date, S4 = 4/30)

| Figure | Before | After |
|---|---|---|
| Cost-base headcount S2 | 257 | 283 |
| Rent headcount S7 | 182 | 208 |
| Laptop headcount S8 | 235 | 261 |
| Marketing YES rows S3 | 151 | 176 |
| AC team size | 126 | 150 |
| SR team size | 64 | 65 |
| VAS team size | 14 | 15 |
| Offline team size | 53 | 53 |
| Total revenue | 58,51,189 | 58,51,189 (no change, joiners have no November sales yet) |
| People cost | 36,65,018 | 36,72,713 |
| Total cost | 1,63,20,699 | 1,63,28,394 |
| EBITDA | -1,04,69,510 | -1,04,77,205 |
| Reconciliation (revenue / cost / EBITDA) | 0 / 0 / 0 | 0 / 0 / 0 |

**Why costs moved between teams although the total barely changed:**
- Corp salary + OH, rent and marketing are split equally per head. 26 more heads means each person's share fell, and teams that grew took more of it.
- For example, the AC cost rose from 73.6 L to 78.2 L while SR fell from 36.2 L to 33.4 L.

**AC manager rows after (month to date):**
- Aditya Gupta 4 people, cost 2,20,118, EBITDA -2,20,118.
- Shubham Sachdeva 5 people, cost 2,75,148, EBITDA -2,75,148.
- Vishal Jain 1 person, cost 33,769, EBITDA -33,769.
- Ashish Dhawan 9: Team Mapping counts him plus 8 (the pivot says 8; his own row is also "Ashish Dhawan").

### 3.6 Still open after 5 Nov

1. **Revenue of Shubham Sachdeva's direct team.** Today any November sales of those 5 people show in the "Shubham Sachdeva" row. The owner will decide whether that is right.
2. **Vishal Jain.** Left or staying (owner asking Shubham).
3. **Addition tab row 2** (Manav Sharma / Ashlok Adarsh mix-up).
4. **Sahil Pandey's** manager in Saud's team.
5. **Priyanka Kalra and Itisha Singh**: confirmation from Himanshu or Shubham Bansal (both currently zero revenue, zero cost).
6. **October actual costs**: replace the September figures in PnL Import U3:U18 (and the pivot if Shubham Bansal sends new team totals). November then uses October actuals until November actuals exist.
7. **Pivot vs Team Mapping headcount mismatches** (Siddharth, Ayushi, Ashish and so on). Note: part of the gap is people with a blank category (for example Kaushik Kumar and Naisha Jhamb in Siddharth's team), who are not counted anyway.
8. **December**: copy the live workbook for November, rename the live tab, add the month to `EBITDA_MONTHS`, extend the Combined tab.

---

## 4. 5 Nov 2026 (later): Removals tab, Manav, Nigeria fix, Oct / Nov reference columns

**Owner's rule:** if a person is on the removals list, they are out of November completely. Their joining or exit date does not matter.
- Everyone on the list left in October.
- Rohan Singhal (ended 2 Nov) is still excluded from November.
- October is not touched.

### 4.1 Team Mapping: people removed for November

What was done for every person below:
- Reporting To (I) = `NA`
- Relevant for Marketing (O) cleared
- DOE (D) = `2026-10-31`, except Rohan, who has `2026-11-02`. DOE is text, the same format as Srishti Pandey's. No formula reads DOE.

| Row | Person | Was in team | Category | Note |
|---|---|---|---|---|
| 209 | Ashlok Adarsh | Harsha Sudan | SR | |
| 188 | Swati Kiran | Ayushi Kushwaha | SR | intern |
| 8 | Yukti Bhawnani | Tushar Dutta | SR (Dubai) | |
| 231 | Shaheen Bano | Ashish Dhawan | AC | |
| 218 | Laiba Irfan | Siddharth | AC | |
| 193 | Ummer Ahmad Bhat | Siddharth | AC | |
| 207 | Veronica | Siddharth | AC | |
| 112 | Sahil (Pandey) | Arya Verma | AC | closes the "Sahil Pandey's manager" question |
| 234 | Nishant Rawat | Aman Raj Keshari | AC | |
| 235 | Khushi Yadav | Aman Raj Keshari | AC | |
| 203 | Anwar Imam | Tarun Kumar | AC | intern |
| 226 | Shreya Bhardwaj | Tarun Kumar | AC | |
| 215 | Prateek Malhotra | Tarun Kumar | AC | |
| 204 | Rohan Singhal | Arya Verma | AC | intern, ended 2 Nov |
| 142 | Priyanka Kalra | Vishesh Garg | blank | was already zero |
| 177 | Itisha | Vishesh Garg | blank | was already zero |
| 37, 38, 49, 173, 195 | Ilamosi Okwegwa, Mofeyintoluwa Akanbi, Tumininu Sanni, Akintayo Oluwakemi, Ibekwe Kingsley | Lakshay Gupta | SR (Nigeria) | |
| 187 | Anushka Rai | Shikha Martolia | VAS | |
| 118 | Asma Jabeen | Mayur Bajaj | AC | |
| 242 | Pothabattula Jagadesh | Mayur Bajaj | AC | |
| 199 | Usman Farooq | Ritesh Kumar | AC | |
| 167, 232 | Altamash Khan, Srishti Pandey | (already done on 3 / 5 Nov) | | |

### 4.2 People-cost pivot for the removals

- **Rule:** each leaver takes −1 from their team, at that team's per head, so the leaver's cost moves into the shared pool (V).
- **Interns and Manav are not applied yet.**
  - Swati Kiran (Ayushi), Anwar Imam (Tarun) and Rohan Singhal (Arya) are leaving, and Manav (Harsha) is joining.
  - The owner wants a brief first. See 4.6.
- **Priyanka and Itisha** were not taken out of Vishesh Garg's pivot either. It is not known whether Shubham Bansal's original 6-person Vishesh total included them.

| Pivot row | Manager | Before | After | Formula |
|---|---|---|---|---|
| 299 | Lakshay Gupta | 19 / 7,42,118 | 14 / 5,46,824 | `=742118/19*14` |
| 300 | Siddharth | 9 / 5,67,766 | 6 / 3,78,511 | `=567766/9*6` |
| 301 | Tarun Kumar | 10 / 5,28,702 | 8 / 4,22,962 | `=528702/10*8` (Shreya, Prateek; Anwar is an intern, pending) |
| 302 | Tushar Dutta | 9 / 4,96,766 | 8 / 4,41,570 | `=496766/9*8` |
| 305 | Harsha Sudan | 8 / 4,79,434 | 7 / 4,19,505 | `=479434/8*7` (Ashlok; Manav +1 pending) |
| 310 | Ritesh Kumar | 10 / 5,37,287 | 9 / 4,83,558 | `=376101/7*9` |
| 311 | Aman Raj Keshari | 8 / 4,99,823 | 6 / 3,74,867 | `=374867/6*6` |
| 313 | Mayur Bajaj | 7 / 4,32,637 | 5 / 3,09,027 | `=370832/6*5` |
| 317 | Arya Verma | 8 / 3,90,000 | 7 / 3,41,250 | `=292500/6*7` (Sahil; Rohan is an intern, pending) |
| 327 | Shikha Martolia | 5 / 2,51,067 | 4 / 2,00,854 | `=251067/5*4` |
| 329 | Ashish Dhawan | 8 / 4,61,668 | 7 / 4,03,960 | `=230834/4*7` |

Pivot Grand Total went from 281 / 1,63,36,234 to **261 / 1,52,71,852**.

**Side effect until the intern decision is made:**
- The 3 leaving interns are already NA, so they get no cost.
- Their teams still carry them in the pivot head count, so their per-head share is in neither a team row nor the shared pool. It simply drops out.
- Per person it is the team's per head x 4/30, about Rs 6,000 to 7,000 month to date.

### 4.3 Nigeria / Malaysia marketing fix

- **Found:** after the removals, "Not in a manager's team" jumped from 2 to 7 people, with marketing 1,45,407.
- **Cause:** Team Mapping Y gave Nigeria spend to every Nigeria-department row, even those with Reporting To = NA. The Nigeria count S14 also included them.
- **Fix:**
  - Y3 now gives the Nigeria / Malaysia share only when Reporting To is not NA.
  - S10, S14 and S15 now count only people who are not NA.
- **Result:**
  - Nigeria spend (3,04,827 MTD) is now split over 14 people, not 19 (owner OK'd the higher per-person cost).
  - "Not in a manager's team" is back to 2 people / 1,11,049.
  - Total marketing is unchanged at 44,23,124.

### 4.4 Manav Sharma (row 252), per the Addition tab (owner: the Addition tab is the source of truth)

| Field | Before | After |
|---|---|---|
| Emp no | IN0620 | IN0620 |
| Joined | 5 Oct 2026 | 5 Nov 2026 |
| Designation | Intern | Intern |
| Team | Sahil Goyal (category blank) | Harsha Sudan |
| Category | blank | SR |
| H / J / K | | E0975 / E0148 / Shubham Sharma |
| Marketing | | No |

- He now has a people cost via Harsha Sudan's per head.
- Not tracked as a replacement for anyone. The owner said the Addition tab alone decides, so no replacement question is needed.

### 4.5 New reference columns in Team Mapping

These are for reference only; nothing reads them.

- **AD "Counted in October? (reference)"**
  - Yes when the person's email is in the October workbook's Team Mapping with Reporting To not NA and category AC / SR / VAS / Offline.
  - Read live through IMPORTRANGE from the October workbook.
  - AD1 shows the count, 252.
- **AE "Counted in November? (reference)"**
  - Yes when the person is in the live cost base (category AC / SR / VAS / Offline and Reporting To not NA).
  - AE1 shows the count, 261, which equals S2.
- **Why 252 differs from the October report's team size of 255:**
  - The October report also counts the "not in a manager's team" rows and the Revenue Adjustments coaches.
  - AD counts only Team Mapping cost-base people.

### 4.6 Check after the changes (EBITDA - November, month to date)

| Figure | After 3.x (swaps + additions) | After removals |
|---|---|---|
| Cost base S2 | 285 | 261 |
| AC / SR / VAS / Offline team size | 150 / 65 / 15 / 53 | 136 / 58 / 14 / 53 |
| Not in a manager's team | 2 | 2 |
| People cost | 36,72,713 | 36,59,365 |
| Total cost | 1,63,28,394 | 1,63,15,046 |
| EBITDA | -1,04,77,205 | -1,04,63,857 |
| Reconciliation | 0 / 0 / 0 | 0 / 0 / 0 |

Revenue is unchanged at 58,51,189. None of the removed people had November sales.

### 4.7 Still open

1. **Interns in the pivot** (Swati Kiran, Anwar Imam, Rohan Singhal out; Manav in): waiting for the owner after the brief.
2. **Priyanka Kalra / Itisha:** whether their salaries are inside Vishesh Garg's pivot total (if yes, Vishesh 8 → 6). Open pointer, to discuss later.
3. Items from 3.6 still open: Shubham direct-team revenue, Vishal Jain, October actuals, pivot vs Team Mapping mismatches, December setup.

---

## 5. 5 Nov 2026 (later): explain tabs, FAQ, source column

The owner wants to be able to answer any manager's "how is my number worked out" question in one click. Nothing in the EBITDA calculation changed; these tabs only read.

- **Explain - Person** (first tab).
  - Pick a person in B4 (dropdown "Name | email").
  - Rows 7 to 10 show the team, category, whether counted, and days counted, for October vs November.
  - Rows 13 to 26 list every line (SR, AC, VAS revenue, product cost, own-team and shared people cost, corp salary, overheads + rent + laptop, marketing, offline centre, partner payout, total cost, EBITDA) with:
    - October value (from the October workbook)
    - November value (live)
    - a link to the source cell
    - the exact November sum in words, with live numbers
  - Rows 28 to 35 explain why the numbers changed (days, team move, left / new, revenue not prorated, per-head split over 252 vs 261 people, September cost basis, team average).
  - Hidden column H holds helpers: days so far, days in month, the pivot row of the team, the team total and count, the pivot sum, department, marketing flag.
- **Explain - Team.**
  - Pick a manager in B4.
  - Rows 7 to 12 show that team's row in EBITDA - October and EBITDA - November, the sum of the listed people, and the difference (Revenue Adjustments coaches or own marketing).
  - Row 15 down lists everyone in the team in either month with Oct and Nov revenue, cost and EBITDA, plus a note: Same team / Moved to / Moved in from / New in November / Left / Not counted (no sales category).
  - Checked with Siddharth: the people sum equals the EBITDA view exactly for both months (difference 0).
- **FAQ** tab: 22 questions and answers in plain words, in groups (basics, revenue, costs, October vs November, where to look). A few answers read live numbers (days so far, headcount).
- **Explain helper** (hidden).
  - A1 = IMPORTRANGE of the October workbook's Team Mapping A3:AC600, in the same columns as Team Mapping.
  - AE = person dropdown list, AF = manager dropdown list (October and November managers).
  - AH / AI = normalised emails (October / live). Row k in AI matches Team Mapping row k+2.
- **Mapping Summary + People Costs column E**: one line per team saying where the total came from (Shubham Bansal) and every head-count change we made, with the date. Aditya Gupta and Shubham Sachdeva are marked as rows we built ourselves.

### Correction of wording (owner, 5 Nov)

- Team salary totals come from **Shubham Bansal**, not HR.
- We never use a per-person salary column, so do not cite one when explaining.

### Decisions recorded (applied later the same day, see 6)

- **Leaving interns** (Swati Kiran, Anwar Imam, Rohan Singhal): come off their teams at the team average, not their real stipend, the same as earlier leavers.
- **Manav Sharma**: added to Harsha Sudan at the team average until his actual salary is known.
- Waiting for the go-ahead.

---

## 6. 5 Nov 2026: interns and Manav applied (people-cost table)

Owner's call: use the team average, not real stipends, the same as earlier leavers.

| Pivot row | Team | Before | After | Formula | Who |
|---|---|---|---|---|---|
| 301 | Tarun Kumar | 8 / 4,22,962 | 7 / 3,70,091 | `=528702/10*7` | Anwar Imam (intern) out |
| 317 | Arya Verma | 7 / 3,41,250 | 6 / 2,92,500 | `=292500/6*6` | Rohan Singhal (intern) out |
| 318 | Ayushi Kushwaha | 6 / 3,50,501 | 5 / 2,92,084 | `=292084/5*5` | Swati Kiran (intern) out |
| 305 | Harsha Sudan | 7 / 4,19,505 | 8 / 4,79,434 | `=479434/8*8` | Manav Sharma (intern, joined 5 Nov) in |

**Results:**
- Pivot Grand Total went from 261 / 1,52,71,852 to **259 / 1,51,71,744**.
- November total cost went from 1,63,15,046 to 1,63,28,394, and EBITDA from -1,04,63,857 to -1,04,77,205.
- Reconciliation reads 0.

**Why the total cost went up by Rs 13,348:**
- Before this step, the 3 leaving interns were already out of Team Mapping but still inside their team totals.
- So their per-head share was charged to nobody.
- Now that share sits in the shared pool, and Manav carries a Harsha per head.
- Column E of the people-cost table records each change.

---

## 7. 5 Nov 2026: Team Mapping filters (view only)

- **Permanent filter** on header row 2, range A2:AE428. Clicking the arrows does not need a selection.
- **Saved filter views** (filter icon > Filter views):

| View | Rule | id |
|---|---|---|
| One manager's team | I = Siddharth; change the name in the filter | 373644668 |
| Counted in November | AE = Yes | 320782127 |
| Left / removed | I = NA | 51036213 |
| New joiners | AD = No and AE = Yes | 771362089 |
| Marketing = YES | O = YES | 1556042583 |

- **Deleted** the old view "Filter 1" (id 694849546). It hid a fixed list of about 70 manager names in column I.
- **Frozen** columns A and B.
- **Caution:** insert new people above the last row, so the filter range grows with them.

---

## 8. 5 Nov 2026: Team Finder tab (search without filters)

The owner wanted something nobody can switch off by accident, unlike a plain filter.

- **Tab:** `Team Finder` (sheetId 700005), placed first.
- **Controls:** yellow boxes in row 5. Each label is in row 4 above it.

| Cell | Control | Options |
|---|---|---|
| A5 | Manager | dropdown from Explain helper AJ = "All" + managers |
| C5 | Senior manager | dropdown from Explain helper AK = "All" + values of Team Mapping K |
| E5 | Category | All / AC / SR / VAS / Offline / Blank |
| G5 | Status for November | All / Same as October / New in November / Moved team on 1 Nov / Left / removed for November / Not counted |
| I5 | Marketing | All / YES / NO |
| K5 | Search | free text matched against name and email |

- **Row 7:** count of matching people, plus the sum of their November revenue, cost and EBITDA.
  - These sums leave out the Revenue Adjustments coaches, so the total can differ from the EBITDA view.
- **A10:** one ARRAYFORMULA(LET(...)) that FILTERs Team Mapping rows 3 to 700. It is sorted by November team, then name.
  - Columns: name, email, category, department, designation, October team, November team, senior manager, counted Oct / Nov (Team Mapping AD / AE), status, marketing, Nov revenue (S), Nov cost (AB), Nov EBITDA.
  - "Team in October" is looked up from the October workbook via Explain helper.
  - **Status logic:**
    - counted in Nov and not Oct = New in November
    - counted in both and team differs = Moved team on 1 Nov
    - counted in both, same team = Same as October
    - counted in Oct only = Left / removed for November
    - else Not counted
- **Protection:** the whole tab is protected (protectedRangeId 974916879), except A5:L5. Editors: Shivam, Shubham Bansal, the service account.
- **Team Mapping:** already protected the same way (id 1499536635). The filter row and the saved views from section 7 are kept as a backup.
- **Gotcha:** inside LET, Google Sheets does not array-evaluate `range&""` or TRIM(range) unless the whole formula is wrapped in ARRAYFORMULA. A MAP-based version returned nothing until it was rewritten this way.

**Undo (if the owner doesn't like it):**
1. Delete the `Team Finder` tab.
2. Clear Explain helper AJ1:AK1.

Nothing else reads them.

---

## 9. 5 Nov 2026: tab tidy-up (hide only, nothing deleted)

**Checked first:**
- Every formula in the workbook was read (spreadsheets.get with grid data) and searched for references to each tab.
- The Quantum code was grepped too. Quantum reads only the EBITDA tabs.

**What the scan found:**

| Tab | Who reads it | Decision |
|---|---|---|
| Missing coaches | Revenue Adjustments (52 formulas); also a read-only mode in api/crm-leads.js | **kept** (hidden as before) |
| Revenue Adjustments | EBITDA - November (8) | kept |
| NM Spend Extract | EBITDA - November (2) | kept |
| Explain helper | Team Finder, Explain - Person, Explain - Team | kept |
| Marketing Spend, MarSpend.c2 | nobody (old marketing source; W now uses the P&L) | Marketing Spend **hidden**. The BigQuery connection MarSpend.c2 was not deleted, only stays hidden, so nothing is lost. It can be deleted later if wanted. |
| Swap, addition, removals | nobody (already applied) | **hidden** |
| Explain - Team | nobody | **hidden**, after merging into Team Finder |
| Column Guide | nobody; partly out of date (says SR = 2,50,000) | stays hidden. How It Works C23 rewritten so it no longer points there. |
| Offline mapping | nobody yet | left visible (changes pending) |

**Team Finder additions (Explain - Team merged in):**
- Columns P / Q / R: Oct revenue, Oct cost, Oct EBITDA (from the October workbook via Explain helper).
- When a manager is picked:
  - November columns show only for people in that team in November.
  - October columns show only for people in it in October.
  - So movers and leavers appear with the right month.
  - The manager filter now matches the October OR the November team.
- J7: the sum of October EBITDA.
- Row 8: the team's own row from EBITDA - October / November (includes the Revenue Adjustments coaches and own marketing).
- **Checked with Siddharth:**
  - October sum -17,49,346 equals the EBITDA - October row.
  - November -3,37,322 equals the EBITDA - November row.

**Also noticed:**
- The owner hid several tabs himself at the same time (Explain - Person, FAQ, How It Works, EBITDA - October, Mapping Summary, PnL Import, etc.). Left as he set them.
- Visible now: Team Finder, Offline mapping, EBITDA - November, EBITDA - Combined, Team Mapping, CIB Import, SR Deposits.

**Results:**
- Reconciliation 0 / 0 / 0. November total cost 1,63,28,394, EBITDA -1,04,77,205 (unchanged).
- **Undo:** show any hidden tab again (Show hidden sheets). Nothing was deleted.

---

## 10. 5 Nov 2026: 7 unused tabs deleted (owner approved)

**Deleted:**

| Tab | sheetId |
|---|---|
| Swap | 1946960369 |
| addition | 975595675 |
| removals | 1550341651 |
| Explain - Team | 700002 |
| Column Guide | 709121526 |
| Marketing Spend | 1839604375 |
| MarSpend.c2 | 762329838 |

- Deleting MarSpend.c2 removed its BigQuery query (month, marketing_spend from chatbot_marketing.marketing_table_v1, current month).
- No formula referenced any of them (see section 9).
- Their content is recorded in sections 3 and 4: every swap, addition and removal, cell by cell.

**After deleting:**
- Reconciliation 0 / 0 / 0, and the November totals are unchanged.
- Team Finder still works.

**Restore:** Google Sheets File > Version history > a version from before this change, then copy the tab back.

---

## 11. 5 Nov 2026: display fixes (no numbers changed)

**EBITDA - Combined headers were blank:**
- Rows 7, 17, 50, 73, 86 and 109 held `='EBITDA - November'!A7:N7` and the like.
- A plain `=` over a multi-cell range returns only the first cell, so only "Team" / "Manager" / "Person" showed.
- Now `=ARRAYFORMULA('EBITDA - November'!A7:N7)` and so on, so all 14 headings appear.
- Row 2 text updated from "EBITDA View" to "EBITDA - November".

**CIB Import date display:**
- Month column A is now formatted `mmm yyyy`.
- Date column B is now formatted `mm/dd/yy`.
- Why the raw numbers showed: Finance's source stores the month as a date (for example 26 Nov 2026, shown as "Nov-26") and the date as a mix of wrong-way-round dates (3 Nov stored as 11 March) and text. IMPORTRANGE drops their formatting.
- Revenue only reads columns R, S, T, so nothing changed.

**Flagged to the owner, not acted on:**
- 4 VAS rows in Finance's November tab are marked month Oct but dated 3 Nov: Bharat Raj KS 3,75,000; Sherin Mary John 7,32,500; Rashita 2,52,500; Vanshit 1,00,800. Total 14,60,800.
- They are counted in November.
- Not a duplicate of October: Sherin's October row is a separate 1,00,000 part payment.

---

## 12. 5 Nov 2026: Team Finder shows adjusted vs actual revenue and every cost line

The owner's ask: managers check their own numbers in Team Finder, so it should show the split. Actual revenue is for reference only; EBITDA stays on the adjusted revenue.

- **Columns:** Team Finder now has 48 columns (A:AV). A10 is one ARRAYFORMULA(LET(...)). Its LET names use underscores (n_p, o_ab); names like nP returned #NAME?.
  - A to L: name, email, category, department, designation, Oct team, Nov team, senior manager, counted Oct / Nov, status, marketing.
  - M to AD, November:
    - SR, AC, VAS and total revenue as used in EBITDA (Team Mapping P, Q, R, S).
    - **SR / AC / VAS / Total actual = P / 0.75, Q / 0.90, R / 0.95** (green headers).
    - Product cost (T), own-team people (U), shared people (V), corp salary (W), overheads + rent + laptop (X), marketing (Y), offline centre (Z), partner payout (AA), total cost (AB), EBITDA (S - AB).
  - AE to AV, October: the same 18 columns, read from the October workbook's Team Mapping through Explain helper (VLOOKUP on the normalised email).
- **Manager filter:** November values show only for people in that team in November; October values only for people in it in October.
- **Row 7:** count, Nov revenue (adjusted), Nov revenue (actual), Nov cost, Nov EBITDA, Oct EBITDA.
- **Frozen:** column A.

**Checks (5 Nov, month to date):**
- All people:
  - Nov revenue adjusted 57,16,189 = Team Mapping S1.
  - Actual 65,30,888.
  - Nov cost 1,74,81,866 = Team Mapping AB1.
- The EBITDA view totals are slightly higher (revenue 58,51,189, cost 1,75,08,866) because they add the Revenue Adjustments coaches.
- Marketing moved from 44,23,124 to 56,03,596 during the day: the P&L got a new day of spend. That is a real input change, not ours.
- Varsha Baliyan team: Nov EBITDA 3,833 and Oct -13,63,796 both equal the EBITDA views.

**Actual-revenue rows in the EBITDA tabs (agreed design, NOT built yet):**
- One "Actual revenue (before refunds)" line under each table: team-wise, AC, SR, VAS, Offline and Difference, in October, November and Combined.
- It is built into each block's formula after one blank row, so it moves with the list and Quantum stops reading before it.
- Only the revenue cells are filled.

**Offline answers recorded, not applied:**
- Tushita Jolly has left. Her Gurgaon centre goes to Mohit Sharma.
- Tharani Baskar takes over the Bangalore centre and reports to Rishabh Mahajan.

---

## 13. 5 Nov 2026: "Actual revenue (before refunds)" lines in the EBITDA tabs (reference only)

Done in EBITDA - November (live workbook), EBITDA - October (October workbook; the live workbook's EBITDA - October tab imports it) and EBITDA - Combined.

- **Row 14** (under the team-wise Total):
  - November and October: A14 label, C14 = ROUND(C13/0.75), D14 = ROUND(D13/0.9), E14 = ROUND(E13/0.95), F14 = C14 + D14 + E14.
  - Combined: November row 14 + October row 14.
- **Each block** (A18 AC, A51 SR, A74 VAS, A87 Offline, A110 Difference):
  - The block formula is wrapped as `=LET(tb_, <old formula>, IF(COLUMNS(tb_)<14, tb_, VSTACK(tb_, blank row, HSTACK("Actual revenue (before refunds)", "", SR/0.75, AC/0.9, VAS/0.95, total, "" x8))))`.
  - The line therefore always sits one blank row under the last manager and moves with the list.
  - Only the revenue cells are filled; cost and EBITDA stay blank.
- **Block total rows** (16, 49, 72, 85, 108):
  - Changed from `SUM(x18:x47)` to `SUMIF($A$18:$A$47, "<>Actual revenue (before refunds)", x18:x47)`, and so on per block, so the new line is never added into the totals.
  - The consolidated rows 8-12 and the reconciliation read those totals, so nothing changed.
- **Combined block formulas:**
  - The manager-name filter also excludes "Actual revenue (before refunds)", so it is not treated as a manager.
  - The same wrapper then adds Combined's own actual line.
- **Values at 5 Nov:**

| | SR actual | AC actual | VAS actual | Total actual |
|---|---|---|---|---|
| November | 21,00,000 | 15,13,158 | 30,67,812 | 66,80,970 |
| October | 3,43,00,000 | 5,73,53,234 | 3,09,98,022 | 12,26,51,256 |
| Combined | 3,64,00,000 | 5,88,66,392 | 3,40,65,834 | 12,93,32,226 |

- Reconciliation 0 in all three tabs. October EBITDA unchanged at -3,38,56,036.
- **Quantum:**
  - `extractEbitdaViewSections` in lib/ebitdaManagerReport.mjs now stops the consolidated table at a row starting "Actual revenue". Otherwise the page would show it under Total and bold it.
  - Team blocks already stop at the blank row.
  - Slack is unaffected either way (it reads only the team blocks).
  - Built clean. Deployed on 5 Nov as commit 09e395e (Vercel production, Ready).
- **Gotcha:** in the Sheets findReplace API, `$$` in the replacement became a literal `$` and broke the `$2` back-references. The first title-row attempt wrote the wrong range ($A$2:$A$4) for a moment; it was fixed immediately by writing the formulas directly.

---

## 14. 5 Nov 2026: actual lines removed from the EBITDA tabs; Offline mapping applied

### 14.1 Actual revenue lines removed (owner: "will not help" there)

- November, October workbook and Combined:
  - Block wrappers unwrapped with a regex findReplace, back to the original formulas.
  - Title-row SUMIFs turned back into SUMs.
  - Row 14 cleared.
  - The Combined name filter was restored.
- Checked: totals identical, reconciliation 0 in all three. October EBITDA still -3,38,56,036.
- Team Finder keeps its actual columns.
- The deployed Quantum guard (09e395e) is harmless and stays.

### 14.2 Offline mapping applied (effective 1 Nov; October untouched)

The source is the owner's "Offline mapping" tab, with columns M (Remapping?) and N (reason). Owner's confirmations:
- Tushita Jolly left; her Gurgaon centre goes to Mohit Sharma.
- Parul Gurjar left.
- Tharani Baskar is a coach under Rishabh Mahajan, with Rishabh as acting manager and SM, "same as Kunal for Pune and Mumbai" (per Nikhil Pandey).
- Tharani's cost stays at Prashanth's per head, 87,580.
- Bangalore keeps the 50% partner payout.

**Team Mapping:**

| Row | Person | Change |
|---|---|---|
| 284, 291, 292, 293, 300, 301, 332 | Geetanjali, Faisal Ul Din, Tushita Jolly, Parul Gurjar, Anam Parveen, Prashanth P, Arham Sultan | I = NA, D = 2026-10-31, O blank |
| 290, 323, 315 | Lakshya, Soumik, Shivani Panwar | I = Mohit Sharma (H E4422) |
| 331, 336, 340 | Devender, Paras, Jaiesh | I = Shashank Singh Sengar (H E1609) |
| 330, 335 | Poojashree, Rupali | I = Kunal Ramani (H E4058) |
| 328 | Bansal Pratik | I = Gautam Makhija (H E1912) |
| 295 | Tharani Baskar | I = Rishabh Mahajan (H E3358), K = Rishabh Mahajan |
| 286 | Akash Singh | F = Manager, L = Offline, I = Gautam Makhija (was blank category, not counted) |
| 294, 304, 306, 308, 313, 314, 317, 319, 324, 329, 341 | various | K / J (senior manager) changed as in the Offline mapping tab. Labels only. |
| 428-440 (inserted) | 13 joiners | Ishant x11 (Akhilesh Singh, Amit Goswami, Diksha, Diksha Bhatnagar, Ira Khan, Mohit Guleria, Aakash Bhagtani, Falak Akmal, Kritika Singh, Sharma Asutosh, Sneha Kaur), Kunal x1 (Diksha Deepak Tambe), Ankur x1 (Neha Bhagat). DOJ 1 Nov 2026 (the tab had no dates), category Offline, no marketing flag. Fixed ranges grew to $441. |

**Other tabs:**
- Revenue Adjustments row 7 (Akash Singh, revenue-only under Gautam) cleared. He is now counted through Team Mapping, so it would otherwise double count.
- Offline Mapping - Sep'26:
  - F2 Bangalore centre: prashanth.p → rishabh.mahajan.
  - F4 Gurgaon centre: tushita.jolly1 → mohit.sharma.
  - So centre cost and the offline marketing share follow those emails. Rishabh is NA, so Bangalore's centre cost shows in the Difference block, exactly as Kunal's centres do.
- Team Mapping AA3 (partner payout):
  - Own-employee-number list is now {E3990, E3941, E3226, **E3707**}, so Tharani keeps Bangalore's 50%.
  - The manager-number list is unchanged; Rishabh's E3358 was NOT added, because other centres sit under him.

**People-cost table** (tab renamed by the owner to "Mapping +People Costs"; formulas follow renames):

| Team | Before | After |
|---|---|---|
| Ishant Sharma | 8 | 13 (`=443733/8*13`) |
| Kunal Ramani | 5 | 7 (`=270733/5*7`) |
| Mohit Sharma | 3 | 6 (`=188333/3*6`) |
| Gautam Makhija | 2 | 4 (`=110833/2*4`) |
| Ankur Sharma | 3 | 4 (`=207683/3*4`) |
| Karan Bhushan | 5 | 4 (`=273533/5*4`) |
| Prashanth P | 3 / 2,62,740 | row renamed **Rishabh Mahajan**, 1 / 87,580 (`=262740/3*1`) |
| Tushita Jolly | 3 | row deleted |
| Shashank Singh Sengar | 5 | 5 (3 left, 3 moved in) |

Grand total 259 → 266. Column E notes updated.

**Check after:**
- Reconciliation 0.
- November totals: revenue 58,51,189; total cost 1,75,08,866 (unchanged overall). Costs moved between teams.
- Offline team size 53 → 60. "Not in a manager's team" now 3: Gautam, Rishabh, Kunal.

**Akash Singh in October (owner decision, 5 Nov): left as is.**
- In the October workbook he still has a blank category. His October AC revenue (2,25,000, product cost 45,000) is counted under Gautam Makhija through Revenue Adjustments row 7, with no salary or shared cost and no headcount.
- From November he is a full Offline Manager under Gautam (revenue + all costs + headcount).
- The asymmetry is known and accepted, because October was already sent.

---

## 15. 5 Nov 2026: Saloni Garg, Siddhant Parashar (November only)

- **Saloni Garg** (Team Mapping row 416, E5255): moved from Aman Raj Keshari to Srishti Prasad (H E1909, I Srishti Prasad).
- **Siddhant Parashar** (row 249, E5173): left. I = NA, O cleared. DOE left blank (no date given).
- **People-cost table** (Mapping +People Costs):
  - Srishti Prasad 7 → 8 (`=467501/8*8`).
  - Aman Raj Keshari 6 → 5 (`=374867/6*5`).
  - Aditya Gupta 4 → 3 (`=467501/8*3`).
  - Grand total 266 → 265.
- **Open:** "Rajalakshmi" was not found in Team Mapping (no name or email match).
- **Lanka Rajyalakshmi** (row 211, E4938, rajyalakshmi.lanka@, Mayur Bajaj's team, AC): removed for November. I = NA, O cleared, DOE not given. People-cost table: Mayur Bajaj 5 → 4 (`=370832/6*4`), grand total 265 → 264. Reconciliation 0.
- **Stuti Bajaj** (row 418, E5251): Srishti Prasad → Swati Sharma (H E1139, J E4388, K Himanshu Gupta).
- **Radhika Sharma** (row 417, E5262): Srishti Prasad → Mayur Bajaj (H E0507, J E4409, K Shubham Sachdeva).
- People-cost table: Srishti 8 → 6 (`=467501/8*6`), Swati 4 → 5 (`=236244/4*5`), Mayur 4 → 5 (`=370832/6*5`). Grand total stays 264. Reconciliation checked after.

---

## 16. 5 Nov 2026: Slack report shows team size without brackets, plus a "How to read this" note (commit a429b78, deployed)

- **lib/ebitdaManagerReport.mjs `combineParsed`** (used for the Slack messages and pictures):
  - Team size is now only the latest month's count, or "-" if the manager is not in the latest month. It was "Nov (Oct)" before.
  - `combineSections` (the Quantum page tables) keeps the brackets on purpose.
- **`buildEbitdaReport`** takes an optional `howTo` text, shown as a second context block in message 1.
- **api/send-report.mjs `handleEbitdaManagerView`** builds `howTo` for every view:
  - EBITDA, revenue and costs definitions.
  - One line per month: the live month (last entry in EBITDA_MONTHS) reads "month to date, as on <date>"; earlier months read "full month, as reported; costs may update once actuals are final".
  - A Combined line when more than one month is shown.
  - A pointer to the Team Finder and Explain - Person tabs.
- The combined `noteText` no longer mentions brackets.
- **Verified live** in the Combined preview: 4 blocks in message 1, the How-to text is present, and AC table sizes read "3, 5, 3" (no brackets). Nothing was posted to Slack.
- **December:** the month lines follow EBITDA_MONTHS automatically, so no text change is needed.
- **Same day, later (commit 8f5fdc3):** the "How to read this" note was removed again (owner: not required). The `howTo` option stays in `buildEbitdaReport` but is no longer passed. The no-brackets team size stays.
- **Saloni Garg** confirmed: Team Mapping row 416 has Reporting To = Srishti Prasad (H E1909).

---

## 17. 5 Nov 2026: headcount pivots on "Mapping +People Costs" fixed (display only)

- The two pivot tables (A1 AC/SR/VAS, A41 Offline) count Team Mapping people by Reporting To.
- **Problem:** their Reporting To filter was a fixed list of manager names saved long ago. New team names were hidden: Aditya Gupta and Shubham Sachdeva in the AC pivot, Dhiman Dey in the Offline pivot. So Offline showed 59 instead of 60.
- **First attempt:** a custom-formula filter (`='Reporting To'<>"NA"`). It hid everything, so it was reverted the same minute.
- **Fix:** both pivots now list every current manager name except NA (67 names), and the source range is A2:L441.
- **After the fix:** AC 134, SR 58, VAS 14, Offline 60, matching the EBITDA - November team sizes.
- **Caution:** when a brand-new manager name appears, add it to the pivot's Reporting To filter (Pivot editor > Filters > Reporting To), or it will be hidden again.
- **Noticed, not changed:**
  - A61 shows a pre-existing #REF!.
  - The pivot counts the manager's own row, so for example Ashish Dhawan shows 8 and Vishesh Garg 9, while the typed people-cost table holds 7 and 8. That difference was already there.
- **A61 #REF! fixed:**
  - A61 held a third pivot (AC/SR/VAS by Reporting To and email, one row per person). It needs about 280 rows, so it ran into the typed people-cost table at row 297 and showed #REF!.
  - Moved the same pivot, same settings, to G1 (columns F:Z were empty), where it has room. A61 is now empty.

---

## 18. 5 Nov 2026: Mapping +People Costs clean-up after the owner's check

- **Rows 350-411 removed:**
  - A350 held a fourth pivot (Offline people by manager and email, no counts). E351:E411 held `=VLOOKUP(Bn,$A$298:$A$340,1,0)` checks, which showed #N/A.
  - A workbook-wide formula scan showed nothing reads rows 350-411. Only A298:C343 is read: by Team Mapping U3 / V3 and Explain - Person H4:H7.
  - Cleared A350:F411 (values and pivot).
- **Column D (per head) restored:**
  - My own updateCells writes earlier on 5 Nov put an empty `{}` in column D. With `fields: userEnteredValue`, that clears the cell. So D was blank for 12 rows: Tarun, Harsha, Ishant, Arya, Ayushi, Karan Bhushan, Kunal, Rishabh, Ankur, Mohit, Gautam, Dhiman.
  - D is display only; U3 computes C / B itself, so no number was affected.
  - D298:D343 is now `=IFERROR(Cn/Bn,"")` throughout.
  - **Lesson:** in updateCells, never pass `{}` for a cell you mean to skip; split the request instead.
- **E306** (Srishti Prasad) note updated with the later moves (Saloni in; Stuti and Radhika out).
- **Check:** reconciliation 0. November total cost 1,75,08,866 and EBITDA -1,16,57,677, unchanged.

---

## 19. 5 Nov 2026: Team Finder / Explain - Person range break fixed; November mapping CSV

- **Break found while exporting:**
  - Team Finder showed "No one matches", and Explain - Person showed blanks or 0.
  - Cause: inserting the 13 Offline joiners grew every `'Team Mapping'!X3:X700` reference to `X3:X713`. The fixed `'Explain helper'!AI1:AI698` did not grow, so the arrays had different lengths and the FILTER / XLOOKUP calls failed.
- **Fix** (20 formulas, findReplace):
  - `'Explain helper'!AI1:AI698` became `'Explain helper'!AI1:INDEX('Explain helper'!AI:AI,ROWS('Team Mapping'!G3:G713))`, and the same for the `$` form.
  - The helper range is now sized from the Team Mapping range, so future row inserts keep them in step.
  - Verified: Team Finder lists 439 people, and Nov revenue / cost match Team Mapping S1 / AB1.
- **No EBITDA numbers were affected.** These tabs only read.
- **docs/ebitda/November-2026-mapping-counted.csv:**
  - Every person counted in November (Team Mapping AE = Yes): 266 people. AC 134, SR 58, VAS 14, Offline 60, matching the EBITDA - November team sizes.
  - Columns: employee number, name, email, category, department, designation, team, manager employee number, senior manager, DOJ, marketing flag, status vs October, October team.
  - Status: Same as October 200, New in November 48, Moved team 18.
  - Gautam Makhija, Kunal Ramani and Rishabh Mahajan (Reporting To = NA) are not in the list. Only their centre and marketing costs appear, in the "not in a manager's team" block.

---

## 20. 5 Nov 2026: Shankey Sharma left, Mansi Mehrotra joined (November only)

- **Shankey Sharma** (E5234, shankey.sharma@, Team Mapping row 405, Ashish Dhawan's team, AC, DOJ 12 Oct 2026):
  - Reporting To was already NA when checked (owner had set it). Cleared Relevant for Marketing (O405).
  - People-cost table row 329 Ashish Dhawan: 7 → 6, C = `=403959.5/7*6` (per head 57,708.5 unchanged).
- **Mansi Mehrotra** (E5256, mansi.mehrotra@, row 442, SR, Consultant, DOJ 19 Oct 2026, marketing YES):
  - Owner had added the row with H:J blank. Filled H442:J442 = E1306 / Kavya Sahni / E0824 (K already Priyansh Singh Solanki).
  - Counted from November only (AE = Yes); the October workbook is untouched.
  - People-cost table row 320 Kavya Sahni: 4 → 5, C = `=279167/4*5` (team average 69,791.75).
- Row 442 was already inside every Team Mapping formula range (AE and cost columns filled), so no range change was needed.
- Grand total headcount stays 264. How It Works change log row 121.
- **Check:** reconciliation 0. November total revenue 58,51,189, cost 1,74,71,221, EBITDA -1,16,20,032 (month to date, after the change).

---

## 21. 5 Nov 2026: Vipul Kumar (intern) added under Shilpa; CSV refreshed

- **Source:** Shubham Bansal's Slack DM, 5 Nov 19:35 IST: `IN0622 Vipul Kumar 10/12/2026 Intern vipul.kumar2@leverageedu.com Shilpa`. Owner confirmed in the thread: Shilpa, SR, senior manager Shubham Sharma.
- **Team Mapping row 443:** A:L = IN0622 / Vipul Kumar / 10/12/2026 / (no DOE) / B2C - Online / Intern / vipul.kumar2@leverageedu.com / E1054 / Shilpa / E0148 / Shubham Sharma / SR. N = FALSE. O (marketing) left blank, like the other interns. Counted from November only (AE = Yes).
- **People-cost table row 316 Shilpa:** 4 → 5, C = `=294166/4*5` (team average 73,541.5) until his stipend is known. Grand total 264 → 265.
- **Mistake fixed in the same minute:** my first write went to row 315 (Swati Sharma) instead of 316. Swati restored to B = 5, C = `=236244/4*5` (2,95,305, the value it had). The original C formula text may have been written differently, but the value is identical.
- **Check:** reconciliation 0. November total cost 1,74,39,079, EBITDA -1,15,87,890 (month to date).
- **CSV `November-2026-mapping-counted.csv` refreshed:** Shankey Sharma out, Mansi Mehrotra and Vipul Kumar in. 267 people: AC 133, SR 60, VAS 14, Offline 60. Status: Same as October 200, New in November 49, Moved team 18.
- How It Works change log row 122.

---

## 22. 5 Nov 2026: Sahil Gulati left; G1 pivot rebuilt as the November people list

- **Sahil Gulati** (E5220, sahil.gulati@, Team Mapping row 422, Amit Tomar's team, AC, DOJ 12 Oct): owner set Reporting To = NA and confirmed he left. Cleared O422 (marketing). People-cost row 326 Amit Tomar 9 → 8, C = `=388749/9*8` (per head 43,194.33 unchanged). Grand total 265 → 264.
- **G1 pivot ("Mapping +People Costs"), the list Shubham Bansal uses to send people cost:**
  - Before: source Team Mapping A2:L441 (missed rows 442+), filter Category in AC/SR/VAS (no Offline), Reporting To filtered by a fixed name list that still included NA (leavers showed).
  - Now: source Team Mapping A2:AE800 (new rows are picked up up to 800), one filter AE (counted in November) = Yes, rows Category > Reporting To > Employee Name > Email, COUNTA of name. Subtotals per category and per team. No manual name list to maintain.
  - Fits in G:K above the people-cost table's columns (A:E), so no collision with row 298.
- **Check:** pivot Grand Total 266 matched the sheet before Sahil was found; after his removal it equals the refreshed CSV (266: AC 132, SR 60, VAS 14, Offline 60). Reconciliation 0.
- How It Works change log row 123.

---

## 23. 6 Nov 2026: Vishal Jain resigned

- **Vishal Jain** (E4837, vishal.jain@, Team Mapping row 17, AC, Manager - Business Development, DOJ 15 Jun 2026): owner said he left / resigned. Closes the open pointer "Vishal Jain team of 1 pending".
- Team Mapping I17 = NA. O17 (marketing) was already blank. AE17 now No; AD17 (October) stays Yes, October untouched.
- People-cost row 309 Vishal Jain: B 1 → 0, C 77,133.6 → 0 (row kept with the history in column E rather than deleted, so no table range shifts). D shows blank (IFERROR).
- Grand total 264 → 263. The G1 pivot drops him automatically (AE filter).
- CSV refreshed: 265 people (AC 131, SR 60, VAS 14, Offline 60).
- **Check:** reconciliation 0. November month to date on 6 Nov: cost 1,96,80,952, EBITDA -1,38,29,763 (the jump from 5 Nov is the extra day of cost, not this change).
- How It Works change log row 124.

---

## 24. 6 Nov 2026: November people cost switched to Bharti's actuals

- **Source:** Bharti pasted a table at `Mapping +People Costs`!A61:C108 (plain values, not a pivot): team (Reporting To), people count, monthly salary total, plus a note "Overall Manish's team cost - 2,70,11,893". Owner: these are **November actuals**; October also already uses actuals and must not change.
- **Method is unchanged** (owner asked to recall it before changing anything):
  - Own-team cost per person (Team Mapping U3) = team total (C) / team size (B) x share of month gone (EBITDA - November S4).
  - Shared cost per person (Team Mapping V3) = (total people cost `PnL Import`!U3 - SUM of all team totals C298:C343) / cost-base headcount (S2) x S4.
- **Changed inputs (live sheet only):**
  - `Mapping +People Costs`!B298:C343: Bharti's counts and totals, matched by team name. Sum 1,59,38,327 for 265 (was 1,53,19,652 for 263). Vishal Jain row kept at 0. Column D re-written as `=IFERROR(Cn/Bn,"")`; column E now says "November actual from Bharti (6 Nov 2026). Before: X people, Y" so every old value is kept.
  - Counts differ from ours only where Bharti counts the manager too: Ashish Dhawan 6 -> 7, Vishesh Garg 8 -> 9 (those match the people actually mapped to them).
  - `PnL Import`!U3: 2,74,39,397 (Sep P&L) -> 2,70,11,893 (November total), label in T3 updated. Shared cost is now 1,10,73,566 (was 1,21,19,745).
- **Biggest team changes:** Swati Sharma 2,95,305 -> 8,05,971 (flagged to the owner as high, about 1.6 L per head; owner said go ahead), Ashish +93,916, Gautam +80,833, Ishant -73,300, Vishesh +66,855, Rishabh Mahajan (Tharani) 87,580 -> 70,000.
- **October:** the October workbook has its own `PnL Import`!U3 (27,439,397) and its own people-cost table, checked before writing; nothing there was touched.
- **Check:** reconciliation 0 (6 Nov, month to date): revenue 75,84,177, cost 2,00,76,262, EBITDA -1,24,92,085. Quantum `/dashboard/manager-ebitda` November view shows the same totals (people cost 44,67,109).
- How It Works change log row 125.

---

## 25. 6 Nov 2026: reference, how November marketing (PM cost) is split today (no change)

Asked by the owner; recorded so later "where does marketing come from" questions can be answered by cell.
- **Total:** `'EBITDA - November'!S5` = `SUMIFS('PnL Import'!N2:N1200, 'PnL Import'!A2:A1200, 'PnL Import'!U1)` = PM Cost (column N of the imported `Daily P&L` tab, `'PnL Import'!A1` IMPORTRANGE) for the current month. 6 Nov: 56,15,857.
- **Offline centres:** share `S16` = `SUM('Offline Mapping - Sep''26'!E2:E16)` (31,78,815) / `'PnL Import'!U6` (September PM cost 3,58,00,000) = 8.88% (still September's ratio). S5 x S16 = 4,98,653, split across the 15 centres by their column E weight and added to the centre manager's row (column F email) in `'Team Mapping'!Y3`. Kunal Ramani (Mumbai + Pune) 82,768, Mohit Sharma (NSP + Gurgaon) 52,934, Gautam (Model Town) 61,550, etc. Offline coaches get 0.
- **Nigeria / Malaysia:** `S12` / `S13` from tab `'NM Spend Extract'` (BigQuery `chatbot_marketing.marketing_table_v1`, NOT from the PM cost column): 4,08,080 / 14 people (`S14`) = 29,149 each; 25,648 / 3 (`S15`) = 8,549 each. `S9` = S12 + S13.
- **Rest:** S5 x (1 - S16) - S9 = 46,83,477, split over `S11` = 138 people (column O = YES, outside Nigeria / Malaysia) = 33,938 each. Formula in `'Team Mapping'!Y3`.
- Check: 4,98,653 + 4,33,728 + 46,83,477 = 56,15,857.
- Known stale text: How It Works B36 still says Nigeria spend is split over 19 people (it is 14). Not fixed yet.
- Owner rule (saved to memory): always cite the exact tab and cell, never "given by Finance".

---

## 26. 6 Nov 2026: AGREED, NOT YET BUILT -- new November people-cost split (upskilling out, SM + AD pot)

Owner's inputs at `'Mapping +People Costs'!A114:C119`:
| Cell | Label | Value |
|---|---|---|
| B114 | Total B2C (Manish's team, November) | 2,70,11,893 |
| B115 | B2C SR AC VAS Offline actual (team totals) | 1,59,38,327 |
| B116 | Upskilling (October 14,14,585 + November 14,14,585) | 28,29,170 |
| B117 / C117 | SM + AD cost / people | 23,71,000 / 243 |
| B119 / C119 | Remaining / people | 58,73,396 / 265 |

- **Why:** in October the unallocated (shared) people cost wrongly included upskilling. October is NOT corrected (decisions were made on it). Instead both months' upskilling (2 x 14,14,585) is taken out of November's shared cost. This lowers November cost by 28.29 L and so improves November and Combined EBITDA; some people negative in October will show positive in Combined.
- **New split (November only, each pot x days gone, like today):**
  1. Team actuals (B115) per team, as today.
  2. Upskilling (B116) removed, carried by nobody.
  3. SM + AD (B117) split equally over everyone counted EXCEPT Soumitra Chaturvedi's whole team (17) and Varsha Baliyan's whole team (5): 265 - 22 = 243. Reason: Soumitra and Varsha report directly into the hierarchy and their own salaries are already inside their team totals (see `'Mapping +People Costs'!G:K` and Bharti's `A61:C107`, same counts). Do NOT describe this as "counted elsewhere".
  4. Remaining (B119) split equally over all 265.
- **Open choice:** count 243 / 265 live from Team Mapping (my recommendation) or use the typed C117 / C119.
- **Not done yet:** owner said "don't implement". When built: change `'Team Mapping'!V3` (shared people cost) to the two-pot formula, keep October workbook untouched, check reconciliation 0, check Quantum November and Combined views, log here and in How It Works.

---

## 27. 6 Nov 2026: deep review of sheet vs Quantum vs Slack; November range bug fixed

**Review (owner asked "is everything exact"):** pulled `type=ebitda_manager_view` for oct / nov / combined from Quantum (the page and the Slack messages are both built from this one read) and compared with the sheet tabs.
- **October:** Quantum = `'EBITDA - October'` in the October workbook exactly (revenue 10,67,90,957, cost 14,06,47,051, EBITDA -3,38,56,094, 255 people). Its Team Mapping ends before row 438, so the 441 limit never mattered there. Not touched.
- **Combined:** `'EBITDA - Combined'` = Quantum combined = October + November exactly.
- **Slack header figures** (e.g. November revenue 75.6 L) leave out the "Not in a manager's team" block by design (22,500 revenue / 1,94,873 cost in November).
- **November bug found:** every formula on `'EBITDA - November'` read `'Team Mapping'!X3:X441` (the four manager-table LETs, the difference block A110, reconciliation C153:C154, and S7, S8, S10, S11, S14, S15). Team Mapping now has rows to 443, so Mansi Mehrotra (442) and Vipul Kumar (443) were missing from the November tables. The reconciliation had the same 441 limit, so it still showed 0 and hid the gap. S2 (cost base 265) was open-ended, so shared cost was already divided by 265 while only 263 people appeared in the tables. Kavya Sahni and Shilpa showed 4 people instead of 5.
- **Fix:** findReplace on `'EBITDA - November'` `$441` -> `$800` (106 occurrences in 12 formulas) plus `3:L441`, `3:S441`, `3:AB441` -> `...800` (the reconciliation); then an all-sheet `$441` -> `$800` (5 formulas, Revenue Adjustments). Blank rows up to 800 are ignored by the existing `G<>""` / category filters.
- **After:** November headcount 263 -> 265 (269 with the "not in a manager's team" block), cost 2,12,74,321 -> 2,13,50,459 (+76,138), EBITDA -1,36,90,144 -> -1,37,66,282, people cost 45,01,982 = 2,70,11,893 x 5/30 exactly, marketing rows (S11) 138 -> 139. Reconciliation 0. Quantum November and Combined re-read and match (Kavya 5, Shilpa 5; Combined shows "5 (4)").
- **Lesson:** a fixed row limit hides new joiners and the reconciliation shares the same blind spot. When adding rows past 800, extend again (or switch to open ranges).
- **Still stale (text only):** `'EBITDA - November'!A2` and the Quantum page summary say "costs are September totals"; people cost is now November actual (product / corp / rent are still September). How It Works B36 still says 19 Nigeria people (14).

---

## 28. 6 Nov 2026: stale wording fixed (text only, no numbers)

- `'EBITDA - November'!A2` (the subtitle Quantum shows under the title, and the sheet's own line 2) was "costs are September totals pro-rated to X/Y". Now: "people cost is <month> actual, other costs are September totals, all pro-rated to X/Y of the month". The month name comes from S17. The Quantum page reads this cell, so no code change was needed.
- `'How It Works'!B36` said Nigeria spend is split over 19 people; it is now a formula reading `'EBITDA - November'!S14` / `S15` (14 / 3 today), so it cannot go stale again.
- October workbook text left as is (owner: never touch October), even though its A2 also says "September totals".
- How It Works change log row 128.

---

## 29. 6 Nov 2026: Swati Sharma team corrected; clarification of what is live vs agreed

- Owner corrected Bharti's table: `'Mapping +People Costs'!C90` Swati Sharma 8,05,971 -> 2,80,971 (Grand total there 1,54,13,327; B115 also reads 1,54,13,327). Copied to the live team total `C315` = 2,80,971 (D315 formula kept; E315 note updated).
- Effect: team totals 1,59,38,327 -> 1,54,13,327; shared pot (still the CURRENT method, one pot over 265) 1,10,73,566 -> 1,15,98,566. Total people cost unchanged at 2,70,11,893 x 5/30 = 45,01,982 (`'EBITDA - November'!H13`). Swati's team carries 5,25,000/month less, everyone carries about 1,981/month more. Reconciliation 0.
- **Clarified to the owner:** the 243 / 265 two-pot split with upskilling removed (section 26) is still NOT built. With it, November's total people cost would become (2,70,11,893 - 28,29,170) x 5/30 = 40,30,454, and the remaining pot (B119) is now 63,98,396 (because B115 dropped by 5,25,000).
- How It Works change log row 129.

---

## 30. 6 Nov 2026: BUILT the November split from section 26 (upskilling out, SM + AD pot)

- **New cell** `'EBITDA - November'!R19:S19` "Cost-base people for the SM + AD split": `=S2-SUMPRODUCT(REGEXMATCH('Team Mapping'!$L$3:$L$800&"","^(AC|VAS|SR|Offline)$")*((TRIM(I)="Soumitra Chaturvedi")+(TRIM(I)="Varsha Baliyan")))` = 243 (265 - 17 - 5), live, so joiners/leavers adjust it. Owner chose live counts over the typed C117 / C119.
- **`'Team Mapping'!V3` (shared people cost per person) rewritten:**
  - Before: `('PnL Import'!U3 - SUM('Mapping +People Costs'!C298:C343)) / S2 x S4` (one pot over 265).
  - Now: `( (U3 - SUM(C298:C343) - 'Mapping +People Costs'!B116 - 'Mapping +People Costs'!B117) / S2 + IF(team is Soumitra Chaturvedi or Varsha Baliyan, 0, B117 / S19) ) x S4`.
  - Inputs: U3 2,70,11,893 (same as B114); team totals SUM(C298:C343) 1,54,13,327 (= B115); B116 upskilling 28,29,170; B117 SM + AD 23,71,000. Edit B116 / B117 to change the pots.
- **Per person per month:** remaining pot 63,98,396 / 265 = 24,145; SM + AD 23,71,000 / 243 = 9,757. Soumitra / Varsha teams carry 24,145, everyone else 33,902. On 6 Nov (x 5/30): 4,024 and 5,650 (checked on rows 18-19 and 58).
- **Result (6 Nov, month to date):** people cost 45,01,982 -> 40,30,454 (= (2,70,11,893 - 28,29,170) x 5/30 exactly), total cost 2,13,50,459 -> 2,08,78,931, EBITDA -1,37,66,282 -> -1,32,94,754. Reconciliation 0.
- **October:** unchanged (Quantum October still 14,06,47,051 cost). Combined = October + November (16,15,25,982 cost). Quantum Oct / Nov / Combined re-read and match the sheet; the Slack report is built from the same read.
- `'Explain - Person'!D19:E19` reworded to show the two pots and the Soumitra / Varsha exclusion.
- How It Works change log row 130.

---

## 31. 6 Nov 2026: Rishabh Mahajan and Kunal Ramani's centre marketing moved into their team rows

- **Why they sat in Difference:** the manager tables add up only people whose Reporting To is the manager. Rishabh (Team Mapping row 288), Kunal (row 305) and Gautam (row 283) are themselves Reporting To = NA, but their own rows carry their centres' costs (Team Mapping Y marketing, Z offline centre). So their own costs landed in the Difference block. Gautam was already handled by `'Revenue Adjustments'!A34` ("manager whose own marketing spend is counted in their row"; the Offline table LET adds `SUMIFS(ownm,ownn,m)` to marketing and cost, and the Difference block subtracts it via `mvf`).
- **Change:** `'Revenue Adjustments'!A35` = Rishabh Mahajan, `A36` = Kunal Ramani (B35 / B36 fill themselves from Team Mapping Y).
- **Result (6 Nov):** Rishabh's team row marketing 37,341, Kunal's 87,320, now in the Offline table. Difference block marketing 1,24,662 -> 0, cost 1,94,873 -> 70,211. Totals unchanged, reconciliation 0.
- **Still in Difference:** their offline centre cost (Rishabh 8,386, Kunal 57,325; Team Mapping Z), because the A34:A40 list only moves marketing; and Khushi Yadav's November AC sale (22,500 revenue, 4,500 product cost; she left 31 Oct, Reporting To NA). Not fixed (owner asked one step at a time).
- How It Works change log row 131.

---

## 32. 6 Nov 2026: their offline centre cost moved too; Difference block cleaned

- **New column** `'Revenue Adjustments'!C33:C40` "Own offline centre cost (from Team Mapping Z)": `=IF(A34="","",SUMIFS('Team Mapping'!$Z$3:$Z$800,'Team Mapping'!$B$3:$B$800,A34))`, same for rows 35-40.
- **`'EBITDA - November'!A87` (Offline table LET):** added `ownz,'Revenue Adjustments'!$C$34:$C$40`; offline centre column now `SUMIFS(offv,rp,m,okm,1)+SUMIFS(ownz,ownn,m)`; total cost adds `+SUMIFS(ownz,ownn,m)`.
- **`'EBITDA - November'!A110` (Difference block LET):** offline centre `offv*(1-mvf)`, cost `csv-(mktv+offv)*mvf`, EBITDA `rvv-csv+(mktv+offv)*mvf`; row filter `rvv+csv-(mktv+offv)*mvf>0`, so listed managers no longer appear as all-zero rows.
- **Result (6 Nov):** Rishabh Mahajan team row: marketing 37,341 + offline centre 8,386 (cost 84,302). Kunal Ramani team row: marketing 87,320 + offline centre 57,325 (cost 4,15,642). Difference block = only Khushi Yadav (22,500 AC revenue, 4,500 product cost), headcount 1. Totals unchanged (cost 2,08,78,931, EBITDA -1,32,94,754); reconciliation 0; Combined unchanged in total; Quantum November re-read matches.
- October workbook not touched.
- How It Works change log row 132.

---

## 33. 6 Nov 2026: Khushi Yadav's November AC sale moved to Aman Raj Keshari

- **Why:** Khushi Yadav (Team Mapping row 235, khushi.yadav@, AC, left 31 Oct, Reporting To NA) still has an AC sale in the November CIB tab: 22,500 after the 10% refund, product cost 4,500. With Reporting To NA it sat in the Difference block.
- **Change:**
  - `'Revenue Adjustments'!A7:D7` = khushi.yadav@leverageedu.com / Khushi Yadav / Aman Raj Keshari / NO. Row 7's E/F formulas already read revenue from `'Team Mapping'!Q/R` by email (the row used earlier for Akash Singh); G7 product cost 4,500, I7 cost 4,500.
  - She is still in Team Mapping, so to avoid counting her twice:
    - `'EBITDA - November'!A110` (Difference) filter adds `NOT(ISNUMBER(MATCH('Team Mapping'!$G$3:$G$800,'Revenue Adjustments'!$A$4:$A$30,0)))`.
    - `'EBITDA - November'!C153` / `C154` (reconciliation, Team Mapping side) now subtract the Team Mapping revenue (S) / cost (AB) of any email listed in `'Revenue Adjustments'!A4:A30`. The missing coaches (Luna, Nikita, Harsh) are not in Team Mapping, so they are unaffected.
- **Result (6 Nov):** Aman Raj Keshari AC revenue 36,000 -> 58,500, product cost +4,500. Difference block empty. Totals unchanged (revenue 75,84,177, cost 2,08,78,931, EBITDA -1,32,94,754); reconciliation 0; Quantum November and Combined re-read OK (Combined Difference rows are October's).
- **Rule for later:** any leaver whose sale still lands in the CIB can be moved the same way: add their email, name and old manager in a free row of `'Revenue Adjustments'!A4:A30` whose E/F read Team Mapping (like row 7). Note rows 4-6 / 8-30 read the 'Missing coaches' tab, not Team Mapping; only row 7 reads Team Mapping.
- October workbook not touched.
- How It Works change log row 133.

---

## 34. 6 Nov 2026: final three-way check (sheet = Quantum page = Slack report), no changes

- **Slack vs Quantum data:** every manager row in the 4 Slack tables, for October, November and Combined (45 / 45 / 48 managers), matched name, team size, SR / AC / VAS / total revenue, total cost and EBITDA (Slack shows lakhs to 1 decimal, crore above 100 L). Slack headline figures equal the manager-table totals (October 10.65 Cr / 13.96 Cr / -3.31 Cr, November 75.8 L / 2.09 Cr / -1.33 Cr, Combined 11.41 Cr / 16.04 Cr / -4.64 Cr).
- **Quantum page:** for each of the three views, every manager's revenue, cost and EBITDA and the grand totals appear on the rendered page exactly.
- **Sheet:** row counts per table match (Oct AC 18 / SR 10 / VAS 2 / Offline 15; Nov 19 / 10 / 2 / 14; Combined 20 / 10 / 2 / 16) and spot-checked manager rows match to the rupee; Combined = October + November per manager (e.g. Kunal Ramani revenue 26,38,876 + 90,000 = 27,28,876). Reconciliation 0 on every tab.
- **By design (not errors):** the Slack report leaves out the "Not in a manager's team" block; October's own Difference rows (Shafein Tauheid, Kunal Ramani's October centre costs, Gautam 0) stay in October and therefore in Combined's Difference block, because October is not changed.

---

## 35. 6 Nov 2026: Muhammad Haziq Maricar and Himanya Singh removed (November only)

- **Muhammad Haziq Maricar** (MY003, muhammad.haziq@, Team Mapping row 169, B2C - Malaysia, Ummi Adibah Binti Robai's team, AC): resigned. I169 = NA, O169 (marketing) cleared. People-cost row 314 Ummi: 3 -> 2, C = `=336780/3*2` (Bharti's November actual at team average).
- **Himanya Singh** (himanya.singh2@, row 402, Swati Sharma's team, AC, joined 3 Nov): removed per owner. I402 = NA, O402 cleared. People-cost row 315 Swati: 5 -> 4, C = `=280971/5*4`.
- **Knock-on (all automatic):** cost base `'EBITDA - November'!S2` 265 -> 263; SM + AD base `S19` 243 -> 241; Malaysia people `S15` 3 -> 2 (Malaysia spend 25,648 now split over Ummi and Farha); rent / laptop bases moved by one each.
- **Result (6 Nov data):** Ummi team 2 people, cost 1,16,248; Swati team 4 people, cost 3,43,018. November totals unchanged (cost 2,08,78,931, EBITDA -1,32,94,754): fixed monthly costs are re-split, not reduced. Reconciliation 0; Quantum November re-read matches.
- **Noticed, not caused by this change:** earlier on 6 Nov the offline marketing share `S16` moved 8.88% -> 7.91% and marketing-YES rows rose (someone edited the Offline Mapping / P&L or Relevant for Marketing flags). Not investigated.
- October untouched. How It Works change log row 134.

---

## 36. 6 Nov 2026: leavers' salaries also removed from the November total

- Owner confirmed: a leaver's salary comes out of the total people cost too, not only out of their team (otherwise it is spread over everyone else as shared cost).
- `'PnL Import'!U3` = `=27011893-336780/3-280971/5` = 2,68,43,439 (Haziq 1,12,260 and Himanya 56,194, both at team average; replace with Bharti's exact salaries when given, in both this cell and C314 / C315 of the people-cost table). Label T3 updated.
- `'Mapping +People Costs'!B114` changed from a typed 27,011,893 to `='PnL Import'!$U$3` so the owner's summary block follows the live total.
- **Result (6 Nov data):** people cost 40,30,454 -> 40,02,378 (= (2,68,43,439 - 28,29,170) x 5/30), total cost 2,08,78,931 -> 2,08,50,855, EBITDA -1,32,94,754 -> -1,32,66,678. Combined people cost 3,14,90,014. Reconciliation 0; Quantum Nov / Combined match.
- **Display-only cells not linked:** `'Mapping +People Costs'!B115` (reads Bharti's table total 1,54,13,327, live team total is now 1,52,44,873), C117 (typed 243, live S19 = 241), C119 (typed 265, live S2 = 263), so B118 / B119 there no longer match the live split. The live remaining pot is 2,68,43,439 - 1,52,44,873 - 28,29,170 - 23,71,000 = 63,98,396 over 263. Formulas do not read these cells.
- **Rule going forward:** every leaver = Reporting To NA + marketing cleared + team total minus their salary + U3 minus the same salary.
- How It Works change log row 135.

---

## 37. 6 Nov 2026: summary block A114:C119 linked to the live numbers

- `'Mapping +People Costs'!B115`: `=C108` (Bharti's pasted table total) -> `=SUM($C$298:$C$343)` (the team totals the formulas actually use).
- `C117`: `=C119-B62-B95` (Bharti's counts for Soumitra / Varsha) -> `='EBITDA - November'!$S$19`.
- `C119`: typed 265 -> `='EBITDA - November'!$S$2`.
- B114 already reads `'PnL Import'!U3` (section 36). B116 (upskilling, `=1414585*2`) and B117 (SM + AD, 23,71,000) stay typed; `'Team Mapping'!V3` reads them, so editing them changes the split.
- Now shows: total 2,68,43,439, team actuals 1,52,44,873, upskilling 28,29,170, SM + AD 23,71,000 over 241, remaining 63,98,396 over 263. Numbers unchanged; display only.
- How It Works change log row 136.

---

## 38. 7 Nov 2026: November now to 6 Nov; Sambhav Sethi's SR deposit counted via a new "Other email" column

- **Sources checked on 7 Nov:** `'EBITDA - November'!S4` = 6/30. CIB Import has rows up to 06/11/26. `'PnL Import'` 06-Nov-2026 PM cost filled later in the day (9,92,783; S5 68,18,541 -> 78,11,324). NM Spend Extract refreshed (Nigeria 4,70,736, Malaysia 30,929). SR Deposits has no date column.
- **Unmatched revenue found:** (1) SR Deposits row `sambhav.sethi@leverageedu.com` (1 deposit, 2,62,500) vs Team Mapping G324 `sambhav.sethi2@` (Kushal Sharma's Offline team); owner confirmed same person. (2) CIB `hemanya.singh2@` AC sale 1,88,989 (1,70,090 after 0.9), Team Mapping has `himanya.singh2@`; shows on 'Missing coaches'. Not fixed yet (asked the owner).
- **Change:** Team Mapping had only 31 columns (A:AE); appended column AF "Other email (if SR Deposits or CIB use a different email for this person)". AF324 = sambhav.sethi@leverageedu.com. `'Team Mapping'!P3` now `=MAP($G3:$G,$AF3:$AF,LAMBDA(g,a,IF(g="","",(SUMIFS(SR by g)+IF(a="",0,SUMIFS(SR by a)))*262500)))`. Q (AC) / R (VAS) not changed.
- **Mistake caught:** the first P3 write referenced AF before the column existed and errored (SR revenue showed 0, reconciliation #VALUE!) for under a minute; restored the original formula, appended the column, then re-applied. Verified after.
- **Result (1 to 6 Nov):** Kushal Sharma SR 2,62,500; November revenue 87,16,494 -> 89,78,994, cost 2,44,16,089, EBITDA -1,56,99,595 -> -1,54,37,095. Combined revenue 11,57,69,951, cost 16,50,63,189, EBITDA -4,92,93,238. Reconciliation 0. Quantum + Slack re-checked: all 45 / 48 managers match; Slack headline November 89.8 L / 2.44 Cr / -1.54 Cr, 4 of 45 in profit.
- **Team Finder:** A5 (Manager filter) was blank, so it showed "No one matches"; reset to All (441 people).
- How It Works change log row 137.

---

## 39. 7 Nov 2026: Himanya Singh's November AC sale counted under Swati Sharma

- CIB row 5 Nov, student Chehak Kohli, coach `hemanya.singh2@leverageedu.com` (Team Mapping row 402 has `himanya.singh2@`, and she is Reporting To NA from November), AC 1,88,989 -> 1,70,090 after 0.9. It sat on 'Missing coaches' and was counted nowhere.
- `'Revenue Adjustments'!A8:D8` = hemanya.singh2@leverageedu.com / Himanya Singh / Swati Sharma / NO. Row 8 reads 'Missing coaches' (E8 1,70,090, G8 product cost 34,018, I8 34,018). No headcount, no person costs. No double counting: her Team Mapping row never matched this email.
- **Result (1 to 6 Nov):** Swati AC revenue 3,06,162 -> 4,76,252, EBITDA +50,035 (in profit). November revenue 89,78,994 -> 91,49,084, cost 2,44,50,107, EBITDA -1,54,37,095 -> -1,53,01,023. Combined revenue 11,59,40,041, cost 16,50,97,207, EBITDA -4,91,57,166. Reconciliation 0.
- **Final three-way check:** Quantum and Slack re-read: 45 / 48 managers match the sheet on every figure; Slack headline November 91.5 L / 2.45 Cr / -1.53 Cr, 5 of 45 managers in profit; Combined 11.56 Cr / 16.40 Cr / -4.84 Cr. Ready to post.
- How It Works change log row 138.

## 40. 13 Nov 2026: Combined view moves leavers' October numbers to the manager their people went to

Owner's choice: option B (follow each person). October itself (October workbook, tab `EBITDA - October`, and the October report) is NOT changed. Only the Combined view (sheet tab `EBITDA - Combined`, Combined page view, Combined Slack report) changes.

**Moves (all inside the same team, so team totals and the grand total do not change):**
| Leaver | October numbers go to | What moves |
|---|---|---|
| Vishal Jain (AC) | Mayur Bajaj | Diksha Chhabra's October row: revenue 9,43,231, cost 7,12,069, 1 person |
| Vishal Jain (AC) | Shubham Sachdeva | Rest of Vishal's row (Vishal 0 / 2,82,503; Rukhsar 3,85,106 / 6,00,444; Mohini 4,39,271 / 6,11,277; Dipika 1,35,000 / 5,50,423), 4 people |
| Tushita Jolly (Offline) | Mohit Sharma | Her whole row (Tushita, Lakshya, Soumik), 3 people |
| Prashanth P (Offline) | Rishabh Mahajan | His whole row (Prashanth, Tharani, Parul), 3 people |

**Sheet (`EBITDA - Combined`):**
- A160:O170 "October moves" table. Each move is a minus row (leaver) and a plus row (receiver). Row 170 = net, must be 0 (it is).
  - B163/B166/B168 = minus the leaver's October size from `'EBITDA - October'!B18:B106`; C163/C166/C168 = minus his October row (`MAP(SEQUENCE(1,12), -SUMIFS('EBITDA - October'!C:N col, A = name))`).
  - C164 (Mayur) = Diksha's October row from helper row 172.
  - C165 (Shubham Sachdeva) = -(C163:N163) - C164:N164 (Vishal's row minus Diksha).
  - C167 / C169 = minus the leaver row.
- A171:O172 helper: `C172 = FILTER(IMPORTRANGE(October workbook, 'Team Mapping'!P3:AB800), IMPORTRANGE(..G3:G800) = "diksha.chhabra@leverageedu.com")` (October Team Mapping P:AB). Mapping into the table: People = U+V, Corp salary + OH = W+X, EBITDA = S - AB.
- Manager tables A18, A51, A74, A87: LET now adds `SUMIFS(moves column, moves name, x)` and drops any name with a negative People in the moves table (the leavers). Size bracket = October size + people moved in (Mayur 5 (7), Shubham Sachdeva 5 (4), Mohit Sharma 6 (6), Rishabh Mahajan 1 (3)). LET names `u0/os/ot` gave #ERROR!, renamed `ua/osz/otz`.
- A2 explanation text updated.
- Checked: team title rows unchanged (AC 4,29,24,229 revenue etc.), Vishal / Tushita / Prashanth gone from the tables.

## 41. 13 Nov 2026: Senior manager view (October, November, Combined)

- Senior manager = Team Mapping column K on the manager's OWN row (`XLOOKUP(manager, 'Team Mapping'!B3:B800, K3:K800)`); blank = "Not in Team Mapping". Managers from the four team tables (AC, SR, VAS, Offline) are added up per senior manager. Difference block not included (same as team tables).
- Sheet, all on `EBITDA - Combined` (no new tab):
  - A175 explanation.
  - A178 Combined (reads this tab's own tables, so it has the moves), header 179, table from A180 (column O = managers listed). Size "N (O)" summed from the text.
  - A203 November (from `EBITDA - November`), table from A205.
  - A228 October as reported, no moves (from `EBITDA - October`), table from A230.
  - Title rows B:N = totals (`BYCOL` sums). Checked: totals = sum of the four team tables (Combined revenue 11,96,67,556, cost 18,06,81,458; October 10,65,00,243; November 1,31,67,313).
- Data notes seen while building: several centre heads are their own senior manager in column K (Shubham Sachdeva, Rishabh Mahajan, Gautam Makhija, Kunal Ramani), and Kunal Ramani's team rows say Mandeep Sharma in K while his own row says Kunal Ramani. The table follows the manager's own row.

## 42. 13 Nov 2026: Quantum page and Slack report follow the sheet (commit `ca15031`)

- `lib/ebitdaManagerReport.mjs`: `readEbitdaTab(sheetId, tab, a1)`; `EBITDA_COMBINED_TAB`; `sizeOf` reads "5 (7)" as 5 for Slack; `extractSeniorManagers(grid, label)` finds "Senior managers: <Combined|November|October>"; `buildEbitdaReport` adds a "Senior managers" Slack message (native table + picture in its thread) when `opts.seniorManagers` is passed; `teamPicture` takes optional `title` / `firstCol`.
- `api/send-report.mjs` `handleEbitdaManagerView`: always reads `'EBITDA - Combined'!A1:O260` once. Combined view now = that tab as it is (`parseEbitdaView` / `extractEbitdaViewSections` on it), no longer a sum done in code (`combineParsed` / `combineSections` kept but unused), so page = sheet = Slack by construction. Every view gets the matching senior manager table. Combined note text says leavers are shown under the manager their people went to.
- `src/pages/ManagerEbitdaDashboard.jsx`: "Senior managers: ..." card after the team-wise view, with a Total row. Session cache key v2 -> v3.
- Verified live (13 Nov): Combined SM table 12 senior managers, totals 263 (252) / revenue 11,96,67,556 / EBITDA -6,10,13,902, same as sheet; November 263 / 1,31,67,313 / -2,79,42,867; October 252 / 10,65,00,243 / -3,30,71,035. Slack Combined has 6 messages (header, 4 teams, senior managers with picture). No Vishal / Tushita / Prashanth rows in Combined tables. Nothing posted to Slack.

## 43. 13 Nov 2026: Combined team size shows the current (November) size only, no brackets

Owner's rule (repeated): headcount is never added or bracketed across months; only the current team size is shown. The Combined tab had "5 (7)" style sizes (November, October in brackets), and the Quantum page showed them because it reads that tab. Slack already showed the current size only.

Changed on `EBITDA - Combined` (no code change; page and Slack read this tab):
- B8 `=ARRAYFORMULA('EBITDA - November'!B8:B13)` (was November & " (" & October & ")").
- B16, B49, B72, B85, B108 = the November title-row size (`='EBITDA - November'!B16` etc.).
- Manager tables A18 / A51 / A74 / A87 and Difference A110: size = the manager's November size, "-" if not in November (the bracket part and the "October size + people moved" part removed).
- Senior manager Combined table A180: size = sum of the managers' current sizes (`f(2)`); title B178 `=SUM(B180:B201)`.
- A2 note: "Team size is the current (November) team size only; headcount is never added across months."
- Checked live: Combined page, team tables, senior manager table and Slack all show current sizes only (AC 129, SR 60, VAS 14, Offline 60, total 263; no "N (M)" anywhere in the API response).

## 44. 13 Nov 2026: Team Mapping S (Total revenue) and T (Product cost) now cover every row

- Found after posting the Combined report to #dashboard-testing (13:29 IST): Joydeep Mohanty's row showed AC ₹1,80,296 but Total revenue 0. Cause: Team Mapping S and T were row-by-row formulas (`=SUM(Pn:Rn)`, `=(Qn*0.2+Rn*0.9)`) filled only to row 394 plus row 441; rows 395-440 and 442-443 had none. The only sale in those rows: Suraj Kumar (row 399, Joydeep's team, active), AC ₹1,80,296. The reconciliation stayed 0 because both sides read column S.
- Fix: S4:T800 cleared; S3 = `MAP($G3:$G800,$P3:$P800,$Q3:$Q800,$R3:$R800,LAMBDA(g,p,q,r,IF(g="","",SUM(p,q,r))))`, T3 = `MAP($G3:$G800,$Q3:$Q800,$R3:$R800,LAMBDA(g,q,r,IF(g="","",N(q)*0.2+N(r)*0.9)))`. Any row added later is covered.
- Effect (1-12 Nov): revenue 1,57,16,360 -> 1,58,96,656 (+1,80,296), cost 4,31,64,843 -> 4,32,00,902 (+36,059). Reconciliation 0. The report posted at 13:29 is from before this fix.
- Rollback: per-row formulas `=SUM(Pn:Rn)` and `=(Qn*0.2+Rn*0.9)` in rows 3-394 and 441.

## 45. 13 Nov 2026: Soumitra Chaturvedi and Varsha Baliyan are their own senior managers

- Owner: Manish Kumar Singh is CBO, not a senior manager. Both managers' own Team Mapping column K says Manish Kumar Singh, so they were grouped under him.
- `EBITDA - Combined`!A254:A256: new list "Not a senior manager (above SM level)", A256 = Manish Kumar Singh (room to A260). A manager whose column K names someone in that list stands as their own senior manager.
- A180 / A205 / A230 senior manager formulas: `IF(ISNUMBER(MATCH(k,$A$256:$A$260,0)),x,k)`.
- Now 13 senior managers: Shafein Tauheid, Varsha Baliyan, Kunal Ramani, Shubham Sharma, Rishabh Mahajan, Priyansh Singh Solanki, Rahul Agarwal, Soumitra Chaturvedi, Shubham Sachdeva, Gautam Makhija, Himanshu Gupta, Deepak Panwar, Mohd Saud Khan. Totals unchanged. Page and Slack checked live (13 rows).
- No change in Team Mapping.
