**Age Verification & Funded Membership Programme**

People's Postcode Lottery would like to provide complimentary memberships to individuals aged 16-25. To achieve this securely and efficiently, we propose implementing an automated age verification and membership onboarding system using Yoti, Make.com, and Ghost CMS.

The proposed solution will verify applicants' ages, automatically create eligible memberships, and provide reporting capabilities while minimizing manual administration.

## **Objectives**

The primary objectives of this project are:

* Verify that applicants are between 16 and 25 years old.  
* Prevent abuse and fraudulent applications.  
* Automate membership allocation.  
* Reduce administrative workload.  
* Provide reporting and auditing capabilities.  
* Deliver a seamless user experience.

## **Recommended Solution**

The entire process is designed to minimise manual administration while ensuring that only verified applicants receive access to the funded membership programme.

### 

## **Technology Stack For Automation & Verification**

### **Yoti** 

Yoti will be used as the age verification provider. Yoti is a UK-based identity and age verification platform that enables users to securely verify their age using government-issued identification or approved verification methods.

Key benefits include:

* Trusted UK provider  
* Government ID verification  
* GDPR compliant  
* API and webhook support  
* Designed specifically for age verification use cases

### **Make.com**

Make.com will act as the automation platform.

Responsibilities include:

* Receiving verification results  
* Processing successful applications  
* Triggering membership creation  
* Sending notification emails  
* Maintaining audit records

### **Ghost CMS**

Ghost will continue to manage memberships and subscriber access. We are already use Ghost CMS. 

Ghost provides:

* Membership management  
* User authentication  
* Member segmentation  
* Email communication  
* Administrative reporting

## **Proposed User Journey**

### **Step 1 – Application**

Users visit a dedicated landing page explaining:

* Programme eligibility  
* Age requirements  
* Verification process  
* Privacy information

Users then click "Apply Now."

### **Step 2 – Age Verification**

Applicants are redirected to Yoti.

Yoti performs:

* Identity verification  
* Date of birth verification  
* Age eligibility validation

The applicant receives an immediate result.

Eligible:  
16–25 years old

Ineligible:  
Outside the approved age range

### **Step 3 – Automated Verification Processing**

Once verification is complete, Yoti sends a secure webhook notification. We will use [make.com](http://make.com) to automate that process. There will need custom webhook development work as [make.com](http://make.com) does not have official integration of Yoti 

The webhook contains:

* Verification status  
* Applicant details  
* Age verification outcome

Here following the flow of the process: 

| User |
| :---- |
| Yoti Verification |
| Yoti Webhook |
| Make.com Custom Webhook **(Need Development)** |
| Ghost API **(Need Development)** |
| Create Membership |

### **Step 4 – Membership Creation**

Following successful verification, there are two possible implementation approaches.

### **Option A: Ghost Offer Link**

#### **Process**

1. User passes age verification.  
2. Make.com sends an automated email.  
3. Email contains a Ghost offer link.  
4. User completes registration.  
5. Complimentary membership is activated.

#### **Advantages**

* Quick implementation  
* Low development effort  
* Utilizes existing Ghost functionality

#### **Limitations**

* Offer links may be shared with others.  
* Additional monitoring may be required.  
* Less control over programme access.

###  

### **Option B: Direct Membership Creation (Recommended)**

#### **Process**

1. User passes age verification.  
2. Make.com communicates with Ghost via API.  
3. Ghost automatically creates the member account.  
4. Membership is assigned immediately.  
5. User receives a welcome email.

#### **Advantages**

* Most secure option  
* Prevents offer sharing  
* Fully automated  
* Better user experience  
* Improved reporting and auditing

#### **Additional Benefits**

Members can be automatically labelled for tracking purposes.

Examples:

* Postcode Lottery Programme  
* Youth Membership  
* Verified 16-25

These labels allow future reporting and campaign segmentation.

**Example Ghost Member Creation**

`{`

  `"members": [`

    `{`

      `"email": "user@example.com",`

      `"name": "John Smith",`

      `"labels": [`

        `{`

          `"name": "Postcode Lottery"`

        `},`

        `{`

          `"name": "Verified 16-25"`

        `}`

      `]`

    `}`

  `]`

`}`

## **Recommended Workflow**

| Applicant |
| :---- |
| Landing Page |
| Yoti Verification |
| Yoti Notification URL |
| Custom Webhook Endpoint |
| Retrieve Full Session Result |
| Make.com |
| Ghost API |
| Create Membership |

So here is the plan for that workflow.

1. Yoti sends notification.  
2. Your webhook receives session ID.  
3. Your server calls Yoti API.  
4. Retrieve full verified result.  
5. Check age eligibility.  
6. Create Ghost member.

Yoti specifically provides session retrieval APIs and recommends using webhooks to know when a session is complete

When creating a Yoti session:

`{`

  `"type": "OVER",`

  `"digital_id": {`

    `"allowed": true,`

    `"threshold": 16`

  `},`

  `"doc_scan": {`

    `"allowed": true,`

    `"threshold": 16`

  `},`

  `"ttl": 900,`

  `"reference_id": "ghost-member-123",`

  `"callback": {`

    `"auto": true,`

    `"url": "https://oursite.com/verification-complete"`

  `},`

  `"notification_url": "https://publisher.com/api/yoti-webhook"`

`}`

## 

## **Implementation Plan**

### **Phase 1: Planning (On Going)**

Activities:

* Confirm programme requirements  
* Confirm eligibility criteria  
* Select Yoti package  
* Review Ghost configuration

Estimated Duration:  
1–2 days

### **Phase 2: Verification Integration**

Activities:

* Configure Yoti account  
* Build verification workflow  
* Configure webhooks  
* Complete testing

Estimated Duration:  
3–5 days

### **Phase 3: Automation Setup**

Activities:

* Build Make.com scenario  
* Configure email notifications  
* Configure data logging  
* Test automation flow

Estimated Duration:  
2–3 days

### **Phase 4: Ghost Integration**

Activities:

* Create Landing Page  
* Configure membership workflow  
* Create member labels  
* Connect Ghost API (Vercel Webhook)  
* Test member creation

Estimated Duration:  
7-8 days

### **Phase 5: Testing and Launch**

Activities:

* End-to-end testing  
* Security review  
* User acceptance testing  
* Production deployment

Estimated Duration:  
2–3 days

## **Credentials Required**

Based on the proposed **Yoti \> Webhook \> Make.com \> Ghost** architecture, here are the credentials and access levels  needed.

* Yoti Access  
* [Make.com](http://Make.com) Access (Already Have)  
* Ghost API (Already Have)  
* Vercel (For Custom API Deployment)

