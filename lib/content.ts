/**
 * ============================================================================
 *  PROJECT RISHI — SITE CONTENT & LINKS
 * ============================================================================
 *  This is the single place to edit text, links, and which images appear.
 *
 *  HOW TO ADD YOUR OWN MEDIA
 *  -------------------------
 *  1. Drop image files into the `public/images/` folder, e.g.
 *        public/images/hero-village.jpg
 *  2. Reference them with a leading slash (NO "public"):
 *        image: "/images/hero-village.jpg"
 *  3. Any item with `image: null` will show a labelled placeholder box
 *     until you set a real path. The label tells you what belongs there.
 *
 *  HOW TO UPDATE LINKS
 *  -------------------
 *  Every external link lives in the LINKS object below. Replace the
 *  placeholder URLs (marked  // TODO ) with your real ones.
 * ============================================================================
 */

export const ORG = {
  name: "Project RISHI",
  chapter: "UC Berkeley",
  acronym: "Rural India Social & Health Improvement",
  tagline: "Promoting the sustainable development of rural Indian communities.",
  email: "ucberkeley@projectrishi.org",
  address: "2495 Bancroft Way, Berkeley, CA 94720",
  copyright: "© 2026 Project RISHI, The Berkeley Chapter. All Rights Reserved.",
};

/** All external / action links in one place. Replace TODO values. */
export const LINKS = {
  interestForm: "https://docs.google.com/forms/d/e/1FAIpQLSfk_P2kAZCCGeli9Nwq0v5tjsPdM4C-OG26PkM85o4WWBeYxw/viewform",
  // Released later this cycle — leave "" and the Apply page shows "Released soon".
  application: "https://forms.gle/bnuwBqNuZLqyuf7g8",
  coffeeChats: "https://airtable.com/appRzFKM7Q0VNlrUp/shrDvG2cFmgRKPKhp",
  donate: "/donate", // TODO point at your real donation processor
  instagram: "https://www.instagram.com/ucbprojectrishi/?hl=en",
  facebook: "https://www.facebook.com/ucbprojectrishi/",
  nationalSite: "http://www.projectrishi.org/",
  // Newsletter signup endpoint (e.g. a Google Form, Mailchimp, or your own API).
  newsletterAction: "", // TODO add an endpoint, or leave "" to keep it inert
};

export const NAV = [
  { label: "About", href: "/about" },
  {
    label: "Projects",
    href: "/projects",
    children: [
      { label: "Education", href: "/projects/education" },
      { label: "Water & Sanitation", href: "/projects/water-sanitation" },
      { label: "Women's Empowerment", href: "/projects/womens-empowerment" },
      { label: "Health", href: "/projects/health" },
    ],
  },
  { label: "Contact", href: "/contact" },
];

export const HOME = {
  heroEyebrow: "UC Berkeley Chapter",
  heroLine1: "Project",
  heroLine2: "RISHI",
  heroSub: "Rural India Social & Health Improvement",
  // Hero background image — replace with a wide village / team photo.
  heroImage: "/images/hero-bg.jpg" as string | null, // e.g. "/images/hero-village.jpg"
  // (No longer used — the hero now uses a centered layout over heroImage.)
  heroSideImage: null as string | null,
  missionTitle: "Our Mission",
  missionBody:
    "Project RISHI promotes the sustainable development and growth of rural Indian communities. We continually expand our resources to support our villagers — identifying issues central to our target communities and providing the means to implement solutions through extensive field research and on-campus initiatives.",
  missionImage: "/images/mission.jpg" as string | null, // e.g. "/images/mission.jpg"
  stats: [
    { value: "2008", label: "Berkeley chapter founded" },
    { value: "1,400", label: "Residents in Bharog Baneri" },
    { value: "4", label: "Active project teams" },
  ],
};

export const PROJECTS = [
  {
    slug: "education",
    name: "Education",
    color: "marigold",
    image: "/images/projects/education.jpg" as string | null,
    heroImage: "/images/projects/education-hero.jpg" as string | null,
    quote: "Education is not preparation for life; education is life itself.",
    quoteAuthor: "John Dewey",
    intro:
      "Education is dedicated to improving the learning environment and future opportunities for students in Bharog Baneri. We work with schools and community members to expand access to technology, promote extracurricular growth, and provide mentorship that supports students during and beyond secondary school. Our goal is to make sure every student has the resources and support they need to learn, grow, and pursue their aspirations.",
    highlights: [
      {
        title: "Career Panel",
        body: "Hosts an annual career panel for students in grades 11–12 at Bharog Baneri's Secondary School, inviting speakers from IIM Sirmaur and Central University of Himachal Pradesh who talk to students about paths to higher education, how to choose a suitable career path, and how they selected their careers. This provides students with the opportunity to learn about future careers in an interactive, small-group setting.",
        image: "/images/projects/education-career-panel.jpg",
      },
      {
        title: "Teacher Interviews",
        body: "During the annual India Trip, meets with teachers at the secondary school and local primary schools to identify gaps in education and learn more about the hurdles students face in attending school. Learned how issues such as infrastructural problems, teacher absenteeism, and a lack of opportunity within STEM subjects affect student learning.",
        image: "/images/projects/education-teacher-interviews.jpg",
      },
      {
        title: "IIM Sirmaur / JAL Partnership",
        body: "Established connections with professors and JAL, a community-service student group at IIM Sirmaur, a nearby university in Paonta Sahib. During the 2026 India Trip, conducted a focus-group session with multiple professors at IIM Sirmaur to receive feedback on past and current projects and identify sustainable opportunities for further work. We are working to develop this into a more formal partnership to bring some of JAL's projects to Bharog Baneri.",
        image: "/images/projects/education-iim-jal.jpg",
      },
    ],
    past: [
      {
        title: "STEMRobo Robotics Workshop",
        body: "In September 2025, partnered with the organization STEMRobo to conduct a robotics workshop at the secondary school, including the donation of multiple robotics kits that gave students a hands-on way to learn more about technology and hardware.",
      },
      {
        title: "Kabbadi Mats",
        body: "Students and teachers expressed interest in developing the children's sportsmanship, as many already play sports competitively at a high level and have the opportunity to receive scholarships. Education oversaw the donation of kabbadi mats to the secondary school, allowing students to practice more easily while at school.",
      },
      {
        title: "Textbook Donation",
        body: "As part of a larger ongoing library project, RISHI oversaw the donation of multiple General Knowledge, English, and exam-preparation textbooks that align with and support the existing curriculum at the school. The textbooks are still widely used by teachers.",
      },
      {
        title: "Infrastructural Support",
        body: "Over the years, Education has supported various infrastructural projects within the school, such as constructing an entrance gate, repairing old desks, facilitating the purchase of water filters, and securing supplemental technology for the computer lab.",
      },
    ],
  },
  {
    slug: "water-sanitation",
    name: "Water & Sanitation",
    color: "pine",
    image: "/images/projects/water-sanitation.jpg" as string | null,
    heroImage: "/images/projects/water-sanitation-hero.jpg" as string | null,
    quote: "A drop harvested is a crop harvested.",
    quoteAuthor: "",
    intro:
      "The Water & Sanitation team is committed to increasing safe, clean water access across Bharog Baneri while expanding agricultural education focused on sustainable farming practices. Through environmental education, farming resources, and community workshops, we help strengthen crop resilience during water shortages and support long-term food security. We build rainwater-harvesting systems, test common drinking-water sources, and rebuild and clean heavily used wells for safe drinking use. Our goal is to ensure the village has access to clean, safe water and also promote sustainable agricultural development.",
    highlights: [
      {
        title: "Agricultural Workshops",
        body: "Hosted workshops for 150+ farmers that focused on natural farming and horticulture methods by partnering with Dr. Shiwali Dhiman from KVK Institute, Sh. Amit Kumar Bakshi from the Horticulture Development Block, and the PARAYAS Society NGO. Distributed seed kits and educational materials to increase engagement and awareness.",
        image: "/images/projects/agriculture-workshop.jpg",
      },
      {
        title: "Rainwater Harvesting Systems",
        body: "Surveyed families with water scarcity issues and evaluated their needs in relation to unbiased socioeconomic questions. Using that information, we evaluated 27 Rainwater Harvesting System recipients who will receive a 2,000-liter system to increase agricultural yield.",
        image: "/images/projects/rainwater-harvesting.jpg",
      },
      {
        title: "Primary School Well Building",
        body: "Based on an issue we found regarding irregular water supply and water contamination at the Kujjewala Primary School, we built a 500-liter cement tank that will supply children with clean and accessible water throughout the day.",
        image: "/images/projects/primary-school-well.jpg",
      },
    ],
    past: [
      {
        title: "Natural Resource Water Testing Initiative",
        body: "Tested 10+ locations across the village for coliform and E. coli contamination.",
      },
      {
        title: "SATHI Water Filter System",
        body: "Distributed SATHI water filters, a slow sand-based water filter, to households to purify their drinking water.",
      },
      {
        title: "UC Berkeley Design-A-Thon Sponsored by TGIF",
        body: "Organized a roofless rainwater harvesting system Design-A-Thon in 2026 and had a similar event plus a sustainable development speaker panel in Fall 2021 to create direct impact within the Berkeley community.",
      },
      {
        title: "Built 20+ Rainwater Harvesting Systems",
        body: "Conducted unbiased surveying and worked closely with village contacts and builders to carefully choose recipients based on need for rainwater harvesting systems.",
      },
    ],
  },
  {
    slug: "womens-empowerment",
    name: "Women's Empowerment",
    color: "marigold",
    image: "/images/projects/womens-empowerment.jpg" as string | null,
    heroImage: "/images/projects/womens-empowerment-hero.jpg" as string | null,
    quote: "Women are the future of society.",
    quoteAuthor: "",
    intro:
      "The Women's Empowerment team is focused on improving financial independence and reproductive-health awareness for women and schoolgirls in Bharog Baneri through sustainable, community-driven initiatives. We create opportunities for women to grow small businesses by hosting skill-building workshops, supporting local product creation, and building on existing agricultural practices — such as dairy farming and garlic harvesting — to increase long-term income potential. Through menstrual-health education and reusable-pad distribution events, we work to improve accessibility and comfort for schoolgirls and women. Our mission is to empower female voices, foster long-term independence, and build stronger communities together.",
    highlights: [
      {
        title: "Teen Health Awareness Workshops",
        body: "Hosted workshops for students in grades 9–12 focused on how puberty and hormones influence mental health, physical health, relationships, and everyday teenage life. Conducted separate sessions for schoolgirls and schoolboys, addressing gaps in the secondary school's existing curriculum by introducing boys to menstrual cycles and helping girls explore the effects of social media on healthy relationships and self-confidence.",
        image: "/images/projects/womens-teen-health.jpg",
      },
      {
        title: "Focus Group Interviews",
        body: "Met with women's groups from all 5 ward-level Mahila Mandals and several Self-Help Groups to understand female participation in banking, income generation, and entrepreneurship. Identified sustainable economic opportunities to design relevant workshops in sewing, beauty services, pickle production, and disposable-plate making, allowing women to easily pursue diverse income-generating activities.",
        image: "/images/projects/womens-focus-group.jpg",
      },
      {
        title: "Government Program Awareness",
        body: "Established a formal relationship with the local BDO and government Forest Division to connect women with programs including microloans, entrepreneurship support, and skill-development initiatives. Drawing on frameworks already adopted by neighboring areas to expand access to resources that have successfully supported financial independence and skill growth in rural areas.",
        image: "/images/projects/womens-govt-awareness.jpg",
      },
    ],
    past: [
      {
        title: "Reusable Pad Distribution",
        body: "Partnered with PINKISHE to host an access and education initiative that distributed 1,000+ reusable pads and brought a female gynecologist who taught menstrual hygiene to 200+ women and schoolgirls.",
      },
      {
        title: "Women's x Health",
        body: "Donated a fetal doppler machine, piloted a telehealth program for gynecological consultations with TeleUpchaar, and educated women on breast cancer self-examinations at the Public Health Center.",
      },
      {
        title: "Financial Empowerment Camp",
        body: "Working with Mahila Mandal groups, taught basket-weaving and financial strategies to increase independence and help women sell handmade products.",
      },
      {
        title: "Menstrual Health Education Training",
        body: "Partnered with PINKISHE to train teachers as Certified Menstrual Health Educators, increasing transparency about menstrual cycles from a younger age.",
      },
    ],
  },
  {
    slug: "health",
    name: "Health",
    color: "pine",
    image: "/images/projects/health.jpg" as string | null,
    heroImage: "/images/projects/health-hero.jpg" as string | null,
    quote:
      "For he who has health has hope; and he who has hope, has everything.",
    quoteAuthor: "Owen Arthur",
    intro:
      "The Health team is committed to delivering structured, evidence-informed health initiatives in Bharog Baneri. Recognizing the systemic barriers that limit residents' access to specialized medical care — including difficult terrain and a shortage of on-site specialists — the team organizes targeted health camps spanning dental, ocular, and cancer-education services, equips the Primary Health Center with essential medical equipment, and develops educational materials to build lasting health awareness within the community. Through this coordinated approach, we work to bring critical care directly to Bharog Baneri while fostering the health literacy needed for long-term community well-being.",
    highlights: [
      {
        title: "Specialty Care Rotation Program",
        body: "Established a monthly specialist outreach program at the Bharog Baneri PHC in partnership with Shri Sai Multispecialty Hospital, rotating visits from a gynecologist/OB-GYN, orthopedician, and optometrist to address the community's most critical gaps in specialized care. We coordinate community outreach, clinic preparation, and pre/post-visit surveys to track patient satisfaction and long-term health outcomes.",
        image: "/images/projects/health-specialty-care.jpg",
      },
      {
        title: "Eco-Tourism Bus Shelter",
        body: "Developed Him-Viraam, an eco-tourism bus shelter near Kher Station in Ward 2, in collaboration with the Paonta Forest Department. Designed with bamboo and environmentally sustainable materials, the shelter provides residents with protection from extreme heat and rain during long wait times at a high-traffic stop.",
        image: "/images/projects/health-bus-shelter.jpg",
      },
      {
        title: "Spirometer for the PHC",
        body: "Donated a spirometer to the Bharog Baneri PHC to address respiratory-health concerns stemming from high rates of smoking in the community, enabling Dr. Anirudh Ji to conduct on-site lung-function screenings for residents.",
        image: "/images/projects/health-spirometer.jpg",
      },
    ],
    past: [
      {
        title: "Dental Camps",
        body: "Partnered with NGO Saathi Cares to host a 4-day dental camp at the Bharog Baneri PHC and a mobile clinic across all wards, providing free dental cleanings and tooth extractions to 250+ villagers. Held an additional single-day camp at the local school to increase accessibility for children.",
      },
      {
        title: "Women's x Health",
        body: "Donated a fetal doppler machine, piloted a telehealth program for gynecological consultations with TeleUpchaar, and educated women on breast cancer self-examinations at the Public Health Center.",
      },
      {
        title: "Cancer Education Camp",
        body: "Partnered with Global Cancer Concern India to host a cancer-education camp in Bharog Baneri, providing villagers with accessible information and resources to address concerns and misconceptions around cancer.",
      },
      {
        title: "Ocular Camp",
        body: "Collaborated with VisionSpring to bring an optometrist to the village, conducting vision screenings and distributing reading and prescription glasses to residents with unaddressed visual impairments.",
      },
    ],
  },
];

export const ABOUT = {
  heading: "An NGO that moves forward",
  mission: {
    title: "Mission & Values",
    body: "We take pride in promoting the sustainable development and growth of rural communities in India. In partnership with local community members, leaders, and social enterprises, we identify issues central to our target communities and provide the resources to implement solutions.",
  },
  methodology: {
    title: "5-Step Methodology",
    steps: ["Understand", "Research", "Finance", "Implement", "Evaluate"],
  },
  history: {
    title: "History",
    body: "Project RISHI is a student-run, non-profit organization registered in the United States and India. It was founded in 2005 at UCLA by Dr. Eri Srivatsan. Project RISHI Berkeley, founded in 2008, began working with the village of Bharog Baneri, Himachal Pradesh, in 2012.",
  },
  location: {
    title: "Location",
    body: "Bharog Baneri is a village of 1,400 people in the Sirmaur District of Himachal Pradesh, India. Close to the Himalayan foothills, it has hilly terrain and lies roughly a mile above sea level. The village is split into 5 wards, with 1 school and a primary health center.",
  },
  // Gallery slots for the "Life at Project RISHI" section.
  // Add images to public/images/gallery/ and list their paths here.
  // Gallery for "Life at Project RISHI". Add images to public/images/gallery/
  // and list their paths here. Mix portrait and landscape freely.
  gallery: [
    "/images/gallery/IMG_0036_Original.jpg",
    "/images/gallery/IMG_2816_Original.jpg",
    "/images/gallery/IMG_2908_Original.jpg",
    "/images/gallery/IMG_0081_Original.jpg",
    "/images/gallery/IMG_0083_Original.jpg",
    "/images/gallery/IMG_0742_Original.jpg",
    "/images/gallery/IMG_4018.JPG",
    "/images/gallery/IMG_0039_Original.jpg",
    "/images/gallery/IMG_2814_Original.jpg",
    "/images/gallery/IMG_2921_Original.jpg",
  ] as (string | null)[],
  // Team photo — replace with your group picture.
  teamImage: "/images/team-photo.jpg" as string | null,
  chapters: [
    { name: "Northwestern University", url: "https://www.facebook.com/nuprishi/" },
    { name: "Vanderbilt University", url: "https://www.facebook.com/ProjectRISHIVanderbilt/" },
    { name: "Purdue University", url: "https://www.facebook.com/purdueprojectrishi/" },
    { name: "University of Michigan", url: "https://projectrishi1920.wixsite.com/projectrishi" },
    { name: "University of Pittsburgh", url: "https://www.facebook.com/pittprojectrishi/" },
    { name: "UC Merced", url: "https://www.facebook.com/Project-RISHI-at-UC-Merced-120723732844915/" },
    { name: "UC Santa Barbara", url: "https://www.facebook.com/projectrishiucsb/" },
    { name: "UC Davis", url: "https://www.facebook.com/projectrishiatucd" },
    { name: "UCLA", url: "https://www.facebook.com/projectrishiucla/" },
    { name: "USC", url: "https://www.scprojectrishi.org/" },
    { name: "UC Irvine", url: "https://projectrishiuci.weebly.com/" },
    { name: "Cal Poly Pomona", url: "https://www.instagram.com/projectrishicpp/?hl=en" },
    { name: "UC Riverside", url: "https://www.facebook.com/ucrprishi/" },
    { name: "UC San Diego", url: "https://www.facebook.com/projectrishiUCSD/" },
  ],
};

/** Projects index page — embedded trip video. */
export const PROJECTS_PAGE = {
  videoTitle: "Project Work in Action",
  videoBlurb:
    "A look at our team on the ground in Bharog Baneri — the people, the place, and the work we do together.",
  // Paste a YouTube/Vimeo EMBED url here (the "embed" form, not the watch url).
  //   YouTube example:  https://www.youtube.com/embed/VIDEO_ID
  //   Vimeo example:    https://player.vimeo.com/video/VIDEO_ID
  // Leave "" to show a labelled placeholder until you have the video.
  videoEmbedUrl: "https://youtu.be/ux-yLtuwQyk",
};

export const APPLY = {
  heading: "Thank you for your interest in Project RISHI!",
  termLabel: "Fall 2026 Recruitment",
  // Recruitment timeline — edit dates each cycle.
  timeline: [
    { label: "Tabling", value: "8/26 – 9/10" },
    { label: "Coffee Chats", value: "8/31 – 9/11" },
    { label: "Info Session #1", value: "Mon, September 7th", time: "8 – 10 PM" },
    { label: "Info Session #2", value: "Thu, September 10th", time: "8 – 10 PM" },
    { label: "Applications Due", value: "Fri, September 11th", time: "8:00 AM" },
    { label: "Interviews", value: "9/12 – 9/13 · Invite only" },
  ],
  blurb:
    "Applications open now!",
};
